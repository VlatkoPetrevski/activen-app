import {
  activityInsights,
  calendarView,
  coachRowRange,
  coachRowView,
  progressView,
  type ActivityDetailDto,
  type ActivityDto,
  type CalendarDto,
  type CoachAthleteDto,
  type CommentDto,
  type FeedbackDto,
  type PlanEntryDto,
  type ProgressDto,
} from "@activen/contracts";
import type { Comment, Feedback, Repositories, StoredPlanEntry } from "@activen/db";
import {
  addDays,
  canDisplay,
  localDateOf,
  weekStart,
  type Activity,
  type Audience,
  type LocalDate,
} from "@activen/domain";
import { Inject, Injectable } from "@nestjs/common";
import { REPOSITORIES } from "../tokens.js";

const toPlanDto = ({ language: _l, ...e }: StoredPlanEntry): PlanEntryDto => e;

const toFeedbackDto = (f: Feedback): FeedbackDto => ({
  perceivedEffort: f.perceivedEffort,
  feel: f.feel,
  comment: f.comment,
  updatedAt: f.updatedAt.toISOString(),
});

/**
 * Loads data for the training views shared by the athlete and the coach; the views themselves are
 * pure builders in @activen/contracts. Vendor data-sharing rules (ADR-0003) are applied here: a
 * coach never receives activities from sources that forbid it.
 */
@Injectable()
export class TrainingService {
  constructor(@Inject(REPOSITORIES) private readonly repos: Repositories) {}

  async today(athleteId: string): Promise<LocalDate> {
    const { timeZone } = await this.repos.settings.get(athleteId);
    return localDateOf(new Date().toISOString(), timeZone);
  }

  async calendar(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    audience: Audience,
    activitiesVisible = true,
  ): Promise<CalendarDto> {
    const entries = (await this.repos.plans.listByDateRange(athleteId, from, to)).map(toPlanDto);
    const activities = activitiesVisible
      ? await this.visibleActivities(athleteId, from, to, audience)
      : [];
    return calendarView({
      athleteId,
      from,
      to,
      entries,
      activities,
      overrides: await this.repos.plans.overridesFor(entries.map((e) => e.id)),
      feedback: await this.feedbackFor(activities),
      activitiesVisible,
    });
  }

  async activities(athleteId: string, from: LocalDate, to: LocalDate): Promise<ActivityDto[]> {
    const list = await this.visibleActivities(athleteId, from, to, "owner");
    const feedback = await this.feedbackFor(list);
    return list
      .map((a) => ({ ...a, feedback: feedback.get(a.id) ?? null }))
      .sort((a, b) => b.startTimeInSeconds - a.startTimeInSeconds);
  }

  async activityDetail(athleteId: string, activityId: string): Promise<ActivityDetailDto> {
    const activity = await this.repos.activities.get(athleteId, activityId);
    const day = await this.calendar(
      athleteId,
      activity.calendarDate,
      activity.calendarDate,
      "owner",
    );
    const link = day.links.find((l) => l.activityId === activityId);
    const planEntry = day.entries.find((e) => e.id === link?.planEntryId) ?? null;
    const recent = await this.visibleActivities(
      athleteId,
      addDays(activity.calendarDate, -28),
      activity.calendarDate,
      "owner",
    );
    return {
      activity: day.activities.find((a) => a.id === activityId) ?? { ...activity, feedback: null },
      // GPS streams arrive with the device integrations (FIT/vendor sync).
      route: null,
      planEntry,
      comments: await this.comments(athleteId, { activityId }),
      insights: activityInsights(activity, recent, planEntry),
    };
  }

  async progress(athleteId: string, weeks: number, audience: Audience): Promise<ProgressDto> {
    const today = await this.today(athleteId);
    const from = addDays(weekStart(today), -7 * (weeks - 1) - 28);
    return progressView(
      await this.visibleActivities(athleteId, from, today, audience),
      today,
      weeks,
    );
  }

  async comments(
    athleteId: string,
    options: { activityId?: string; before?: Date } = {},
  ): Promise<CommentDto[]> {
    return this.commentDtos(await this.repos.comments.list(athleteId, options));
  }

  async commentDtos(list: Comment[]): Promise<CommentDto[]> {
    const names = await this.repos.users.displayNames([
      ...new Set(list.map((c) => c.authorId).filter((id): id is string => id !== null)),
    ]);
    return list.map((c) => ({
      id: c.id,
      athleteId: c.athleteId,
      authorId: c.authorId,
      authorName: c.authorId ? (names.get(c.authorId) ?? null) : null,
      activityId: c.activityId,
      planEntryId: c.planEntryId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async coachAthlete(
    link: { id: string; athleteId: string; status: "invited" | "active" | "ended" },
    displayName: string,
    scopes: CoachAthleteDto["scopes"],
  ): Promise<CoachAthleteDto> {
    const status = link.status === "active" ? "active" : "invited";
    const base = {
      linkId: link.id,
      athleteId: link.athleteId,
      displayName,
      status,
      scopes,
    } as const;
    const settings = await this.repos.settings.get(link.athleteId);
    const today = localDateOf(new Date().toISOString(), settings.timeZone);
    if (status !== "active") return coachRowView({ ...base, primarySource: null, today });
    const range = coachRowRange(today);
    const calendar = await this.calendar(
      link.athleteId,
      range.from,
      range.to,
      "coach",
      scopes.includes("activities"),
    );
    const [last] = await this.repos.comments.list(link.athleteId, { limit: 1 });
    return coachRowView({
      ...base,
      primarySource: settings.sourcePriority[0] ?? null,
      today,
      calendar,
      lastComment: last
        ? { body: last.body, createdAt: last.createdAt.toISOString(), authorId: last.authorId }
        : null,
    });
  }

  private async feedbackFor(activities: readonly Activity[]): Promise<Map<string, FeedbackDto>> {
    const map = await this.repos.feedback.forActivities(activities.map((a) => a.id));
    return new Map([...map].map(([id, f]) => [id, toFeedbackDto(f)]));
  }

  private async visibleActivities(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    audience: Audience,
  ): Promise<Activity[]> {
    const list = await this.repos.activities.listByDateRange(athleteId, from, to);
    return list.filter((a) => canDisplay(a.source.vendor, audience));
  }
}
