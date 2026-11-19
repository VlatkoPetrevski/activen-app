import {
  AcceptInvite,
  CommentCreate,
  DateRange,
  FeedbackPut,
  PlanEntryCreate,
  PlanEntryUpdate,
  ProgressQuery,
  UpdateConsent,
} from "@activen/contracts/requests";
import { type CoachLinkDto } from "@activen/contracts";
import { NotFoundError, type ConsentScope, type Repositories } from "@activen/db";
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth } from "../auth/decorators.js";
import { REPOSITORIES } from "../tokens.js";
import { ApiZodBody, ValidBody, ValidQuery } from "../validation.js";
import { createPlanEntry, removePlanEntry, updatePlanEntry } from "./plan-access.js";
import { TrainingService } from "./training.service.js";

const RANGE_QUERY = [
  ApiQuery({ name: "from", example: "2026-11-16" }),
  ApiQuery({ name: "to", example: "2026-11-22" }),
];
const applyAll =
  (decorators: MethodDecorator[]): MethodDecorator =>
  (target, key, descriptor) => {
    for (const d of decorators) d(target, key, descriptor);
  };

/** The signed-in athlete's own training: plan, activities, check-ins, progress, coaches, messages. */
@ApiTags("training")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class AthleteController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(TrainingService) private readonly training: TrainingService,
  ) {}

  @Get("calendar")
  @ApiOperation({ summary: "Plan and activities in a date range, with plan ↔ activity links" })
  @applyAll(RANGE_QUERY)
  calendar(@CurrentAuth() a: AuthContext, @ValidQuery(DateRange) q: z.output<typeof DateRange>) {
    return this.training.calendar(a.userId, q.from, q.to, "owner");
  }

  @Post("plan")
  @ApiOperation({ summary: "Add a plan entry (self-coached athletes)" })
  @ApiZodBody(PlanEntryCreate)
  async addPlan(
    @CurrentAuth() a: AuthContext,
    @ValidBody(PlanEntryCreate) body: z.output<typeof PlanEntryCreate>,
  ) {
    const { locale } = await this.repos.settings.get(a.userId);
    return createPlanEntry(this.repos, a.userId, a.userId, body, locale);
  }

  @Patch("plan/:id")
  @ApiOperation({ summary: "Change a plan entry (409 when it changed meanwhile)" })
  @ApiZodBody(PlanEntryUpdate)
  updatePlan(
    @CurrentAuth() a: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @ValidBody(PlanEntryUpdate) body: z.output<typeof PlanEntryUpdate>,
  ) {
    return updatePlanEntry(this.repos, a.userId, a.userId, id, body);
  }

  @Delete("plan/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a plan entry" })
  async removePlan(
    @CurrentAuth() a: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await removePlanEntry(this.repos, a.userId, id);
  }

  @Get("activities")
  @ApiOperation({ summary: "Activities in a date range, newest first, with check-ins" })
  @applyAll(RANGE_QUERY)
  activities(@CurrentAuth() a: AuthContext, @ValidQuery(DateRange) q: z.output<typeof DateRange>) {
    return this.training.activities(a.userId, q.from, q.to);
  }

  @Get("activities/:id")
  @ApiOperation({ summary: "One activity with its planned session and comments" })
  activity(@CurrentAuth() a: AuthContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.training.activityDetail(a.userId, id);
  }

  @Put("activities/:id/feedback")
  @ApiOperation({ summary: "Check-in after a session: effort 1–10, feel 1–5, comment" })
  @ApiZodBody(FeedbackPut)
  async feedback(
    @CurrentAuth() a: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @ValidBody(FeedbackPut) body: z.output<typeof FeedbackPut>,
  ) {
    const { locale } = await this.repos.settings.get(a.userId);
    const saved = await this.repos.feedback.upsert(a.userId, id, { ...body, language: locale });
    return {
      perceivedEffort: saved.perceivedEffort,
      feel: saved.feel,
      comment: saved.comment,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  @Get("progress")
  @ApiOperation({ summary: "Weekly volume and load, 4-week KPIs and activity mix" })
  @ApiQuery({ name: "weeks", required: false, example: 12 })
  progress(
    @CurrentAuth() a: AuthContext,
    @ValidQuery(ProgressQuery) q: z.output<typeof ProgressQuery>,
  ) {
    return this.training.progress(a.userId, q.weeks, "owner");
  }

  // --- Coaches -------------------------------------------------------------------------------------

  @Get("coaches")
  @ApiOperation({ summary: "My coaches and pending invitations, with what each may see" })
  async coaches(@CurrentAuth() a: AuthContext): Promise<CoachLinkDto[]> {
    const links = await this.repos.coaching.linksOfAthlete(a.userId);
    const names = await this.repos.users.displayNames(links.map((l) => l.coachId));
    return Promise.all(
      links.map(async (l) => ({
        linkId: l.id,
        coachId: l.coachId,
        coachName: names.get(l.coachId) ?? "",
        status: l.status === "active" ? ("active" as const) : ("invited" as const),
        scopes: await this.repos.coaching.scopes(l.coachId, a.userId),
      })),
    );
  }

  @Post("coaches/:linkId/accept")
  @HttpCode(204)
  @ApiOperation({ summary: "Accept a coach and choose what they may see" })
  @ApiZodBody(AcceptInvite)
  async accept(
    @CurrentAuth() a: AuthContext,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @ValidBody(AcceptInvite) body: z.output<typeof AcceptInvite>,
  ): Promise<void> {
    await this.repos.coaching.accept(linkId, a.userId, body.scopes);
  }

  @Put("coaches/:linkId/scopes")
  @HttpCode(204)
  @ApiOperation({ summary: "Change what a coach may see (takes effect immediately)" })
  @ApiZodBody(UpdateConsent)
  async scopes(
    @CurrentAuth() a: AuthContext,
    @Param("linkId", ParseUUIDPipe) linkId: string,
    @ValidBody(UpdateConsent) body: z.output<typeof UpdateConsent>,
  ): Promise<void> {
    const link = await this.ownLink(a.userId, linkId);
    if (link.status !== "active") throw new NotFoundError("coach link", linkId);
    const current = await this.repos.coaching.scopes(link.coachId, a.userId);
    const wanted = new Set<ConsentScope>(body.scopes);
    for (const s of wanted) if (!current.includes(s)) await this.repos.coaching.grant(linkId, s);
    for (const s of current) if (!wanted.has(s)) await this.repos.coaching.revoke(linkId, s);
  }

  @Delete("coaches/:linkId")
  @HttpCode(204)
  @ApiOperation({ summary: "Decline an invitation or stop working with a coach" })
  async endCoach(
    @CurrentAuth() a: AuthContext,
    @Param("linkId", ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    await this.ownLink(a.userId, linkId);
    await this.repos.coaching.end(linkId);
  }

  // --- Messages ------------------------------------------------------------------------------------

  @Get("comments")
  @ApiOperation({ summary: "My thread with my coach, newest first" })
  comments(@CurrentAuth() a: AuthContext) {
    return this.training.comments(a.userId);
  }

  @Post("comments")
  @ApiOperation({ summary: "Write to my coach" })
  @ApiZodBody(CommentCreate)
  async comment(
    @CurrentAuth() a: AuthContext,
    @ValidBody(CommentCreate) body: z.output<typeof CommentCreate>,
  ) {
    if (body.activityId) await this.repos.activities.get(a.userId, body.activityId);
    const { locale } = await this.repos.settings.get(a.userId);
    const saved = await this.repos.comments.add(a.userId, a.userId, { ...body, language: locale });
    const [dto] = await this.training.commentDtos([saved]);
    return dto;
  }

  private async ownLink(athleteId: string, linkId: string) {
    const link = await this.repos.coaching.get(linkId);
    if (link.athleteId !== athleteId || link.status === "ended")
      throw new NotFoundError("coach link", linkId);
    return link;
  }
}
