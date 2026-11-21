import {
  CoachInvite,
  CommentCreate,
  DateRange,
  PlanEntryCreate,
  PlanEntryUpdate,
  ProgressQuery,
} from "@activen/contracts/requests";
import {
  type BriefingDto,
  coachViewer,
  sortByAttention,
  type Viewer,
  type AnalyticsSummaryDto,
  type AthleteAnalyticsDto,
  type CoachAthleteDto,
} from "@activen/contracts";
import { NotFoundError, type ConsentScope, type Repositories } from "@activen/db";
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth, Roles } from "../auth/decorators.js";
import { REPOSITORIES } from "../tokens.js";
import { ApiZodBody, ValidBody, ValidQuery } from "../validation.js";
import { createPlanEntry, removePlanEntry, updatePlanEntry } from "./plan-access.js";
import { BriefingService } from "../briefing/briefing.service.js";
import { TrainingService } from "./training.service.js";

/**
 * The coach workplace. Every route requires the coach role and an active link with the athlete;
 * activity data additionally requires the athlete's "activities" consent and is audited.
 */
@ApiTags("coach")
@ApiBearerAuth()
@Roles("coach")
@Controller({ path: "coach", version: "1" })
export class CoachController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(TrainingService) private readonly training: TrainingService,
    @Inject(BriefingService) private readonly briefings: BriefingService,
  ) {}

  @Get("athletes")
  @ApiOperation({ summary: "My athletes (and pending invitations) with weekly status and signals" })
  async athletes(@CurrentAuth() a: AuthContext): Promise<CoachAthleteDto[]> {
    const links = await this.repos.coaching.linksOfCoach(a.userId);
    const names = await this.repos.users.displayNames(links.map((l) => l.athleteId));
    const rows = await Promise.all(
      links.map(async (l) =>
        this.training.coachAthlete(
          l,
          names.get(l.athleteId) ?? "",
          await this.repos.coaching.scopes(a.userId, l.athleteId),
        ),
      ),
    );
    return rows.sort(
      (x, y) => y.signals.length - x.signals.length || x.displayName.localeCompare(y.displayName),
    );
  }

  @Get("analytics")
  @ApiOperation({
    summary: "Analytics overview of my active athletes (compliance, load, spikes), attention first",
  })
  async analytics(@CurrentAuth() a: AuthContext): Promise<AnalyticsSummaryDto[]> {
    const links = (await this.repos.coaching.linksOfCoach(a.userId)).filter(
      (l) => l.status === "active",
    );
    const names = await this.repos.users.displayNames(links.map((l) => l.athleteId));
    const rows = await Promise.all(
      links.map(async (l) => {
        const scopes = await this.repos.coaching.scopes(a.userId, l.athleteId);
        return (await this.training.analytics(l.athleteId, names.get(l.athleteId) ?? "", scopes))
          .summary;
      }),
    );
    return sortByAttention(rows);
  }

  @Get("athletes/:athleteId/analytics")
  @ApiOperation({ summary: "One athlete's analytics: 12 weeks, form, effort, activities" })
  async athleteAnalytics(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
  ): Promise<AthleteAnalyticsDto> {
    await this.access(a.userId, athleteId);
    const scopes = await this.repos.coaching.scopes(a.userId, athleteId);
    const names = await this.repos.users.displayNames([athleteId]);
    return this.training.analytics(athleteId, names.get(athleteId) ?? "", scopes);
  }

  /**
   * Invites an athlete by email. The answer is the same whether or not the address has an account
   * (no account discovery); existing accounts see the invitation in the app.
   */
  @Post("invites")
  @HttpCode(202)
  @ApiOperation({ summary: "Invite an athlete by email" })
  @ApiZodBody(CoachInvite)
  async invite(
    @CurrentAuth() a: AuthContext,
    @ValidBody(CoachInvite) body: z.output<typeof CoachInvite>,
  ) {
    const athleteId = await this.repos.users.findIdByEmail(body.email);
    if (athleteId && athleteId !== a.userId) {
      const open = await this.repos.coaching.linksOfCoach(a.userId);
      if (!open.some((l) => l.athleteId === athleteId))
        await this.repos.coaching.invite(a.userId, athleteId);
    }
    return { status: "sent" };
  }

  @Get("athletes/:athleteId/calendar")
  @ApiOperation({ summary: "An athlete's plan and (with consent) activities" })
  async calendar(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @ValidQuery(DateRange) q: z.output<typeof DateRange>,
  ) {
    const viewer = await this.viewer(a.userId, athleteId, "activities", "comments");
    return this.training.calendar(athleteId, q.from, q.to, viewer);
  }

  @Get("athletes/:athleteId/activities/:id")
  @ApiOperation({
    summary: "One activity of an athlete: plan, laps and source (requires the activities consent)",
  })
  async activity(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const viewer = await this.viewer(a.userId, athleteId, "activities", "comments");
    if (!viewer.activities) throw new ForbiddenException("The athlete has not shared activities");
    return this.training.activityDetail(athleteId, id, viewer);
  }

  @Get("athletes/:athleteId/briefing")
  @ApiOperation({ summary: "The athlete's morning readiness and advice (sleep_recovery consent)" })
  async briefing(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
  ): Promise<BriefingDto> {
    const viewer = await this.viewer(a.userId, athleteId, "sleep_recovery");
    const scopes = await this.repos.coaching.scopes(a.userId, athleteId);
    if (!scopes.includes("sleep_recovery"))
      throw new ForbiddenException("The athlete has not shared sleep and recovery");
    return this.briefings.briefing(athleteId, undefined, viewer);
  }

  @Get("athletes/:athleteId/progress")
  @ApiOperation({ summary: "An athlete's progress (requires the activities consent)" })
  async progress(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @ValidQuery(ProgressQuery) q: z.output<typeof ProgressQuery>,
  ) {
    const viewer = await this.viewer(a.userId, athleteId, "activities");
    if (!viewer.activities) throw new ForbiddenException("The athlete has not shared activities");
    return this.training.progress(athleteId, q.weeks, viewer);
  }

  @Post("athletes/:athleteId/plan")
  @ApiOperation({ summary: "Plan a session for an athlete" })
  @ApiZodBody(PlanEntryCreate)
  async addPlan(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @ValidBody(PlanEntryCreate) body: z.output<typeof PlanEntryCreate>,
  ) {
    await this.access(a.userId, athleteId);
    const { locale } = await this.repos.settings.get(a.userId);
    return createPlanEntry(this.repos, athleteId, a.userId, body, locale);
  }

  @Patch("athletes/:athleteId/plan/:id")
  @ApiOperation({ summary: "Change an athlete's plan entry" })
  @ApiZodBody(PlanEntryUpdate)
  async updatePlan(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @ValidBody(PlanEntryUpdate) body: z.output<typeof PlanEntryUpdate>,
  ) {
    await this.access(a.userId, athleteId);
    return updatePlanEntry(this.repos, athleteId, a.userId, id, body);
  }

  @Delete("athletes/:athleteId/plan/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove an athlete's plan entry" })
  async removePlan(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.access(a.userId, athleteId);
    await removePlanEntry(this.repos, athleteId, id);
  }

  @Get("athletes/:athleteId/comments")
  @ApiOperation({ summary: "Thread with an athlete" })
  async comments(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
  ) {
    await this.access(a.userId, athleteId);
    return this.training.comments(athleteId);
  }

  @Post("athletes/:athleteId/comments")
  @ApiOperation({ summary: "Recommendation or reply to an athlete" })
  @ApiZodBody(CommentCreate)
  async comment(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @ValidBody(CommentCreate) body: z.output<typeof CommentCreate>,
  ) {
    const viewer = await this.viewer(a.userId, athleteId);
    // Replying about an activity needs what reading it needs (consent, displayable source).
    if (body.activityId) await this.training.assertVisible(athleteId, body.activityId, viewer);
    const { locale } = await this.repos.settings.get(a.userId);
    const saved = await this.repos.comments.add(athleteId, a.userId, { ...body, language: locale });
    const [dto] = await this.training.commentDtos([saved]);
    return dto;
  }

  @Delete("athletes/:athleteId")
  @HttpCode(204)
  @ApiOperation({ summary: "Stop coaching an athlete (or withdraw an invitation)" })
  async end(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
  ): Promise<void> {
    const link = (await this.repos.coaching.linksOfCoach(a.userId)).find(
      (l) => l.athleteId === athleteId,
    );
    if (!link) throw new NotFoundError("athlete", athleteId);
    await this.repos.coaching.end(link.id);
  }

  /** Requires an active link (404 otherwise, so athletes cannot be probed). */
  private async access(coachId: string, athleteId: string): Promise<void> {
    if (!(await this.repos.coaching.activeLink(coachId, athleteId)))
      throw new NotFoundError("athlete", athleteId);
  }

  /**
   * What this coach may see of the athlete right now. Reads of the `audited` scopes are written
   * to the audit log when the athlete shares them.
   */
  private async viewer(
    coachId: string,
    athleteId: string,
    ...audited: ConsentScope[]
  ): Promise<Viewer> {
    await this.access(coachId, athleteId);
    const scopes = await this.repos.coaching.scopes(coachId, athleteId);
    for (const scope of audited)
      if (scopes.includes(scope)) await this.repos.coaching.recordRead(coachId, athleteId, scope);
    return coachViewer(scopes);
  }
}
