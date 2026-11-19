import {
  CoachInvite,
  CommentCreate,
  DateRange,
  PlanEntryCreate,
  PlanEntryUpdate,
  ProgressQuery,
} from "@activen/contracts/requests";
import { type CoachAthleteDto } from "@activen/contracts";
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
    const visible = await this.access(a.userId, athleteId, "activities");
    return this.training.calendar(athleteId, q.from, q.to, "coach", visible);
  }

  @Get("athletes/:athleteId/progress")
  @ApiOperation({ summary: "An athlete's progress (requires the activities consent)" })
  async progress(
    @CurrentAuth() a: AuthContext,
    @Param("athleteId", ParseUUIDPipe) athleteId: string,
    @ValidQuery(ProgressQuery) q: z.output<typeof ProgressQuery>,
  ) {
    if (!(await this.access(a.userId, athleteId, "activities")))
      throw new ForbiddenException("The athlete has not shared activities");
    return this.training.progress(athleteId, q.weeks, "coach");
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
    await this.access(a.userId, athleteId);
    if (body.activityId) await this.repos.activities.get(athleteId, body.activityId);
    if (body.planEntryId) {
      const entry = await this.repos.plans.get(body.planEntryId);
      if (entry.athleteId !== athleteId) throw new NotFoundError("plan entry", body.planEntryId);
    }
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

  /**
   * Requires an active link (404 otherwise, so athletes cannot be probed). With a scope, returns
   * whether the athlete shares it — and audits the read when they do.
   */
  private async access(coachId: string, athleteId: string, scope?: ConsentScope): Promise<boolean> {
    if (!(await this.repos.coaching.activeLink(coachId, athleteId)))
      throw new NotFoundError("athlete", athleteId);
    return scope ? this.repos.coaching.authorizeCoachRead(coachId, athleteId, scope) : true;
  }
}
