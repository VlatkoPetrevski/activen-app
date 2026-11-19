import type {
  ActivityDetailDto,
  ActivityDto,
  CalendarDto,
  CoachAthleteDto,
  CoachSignal,
  CommentDto,
  FeedbackDto,
  PlanEntryDto,
  ProgressDto,
} from "@activen/contracts";
import type { Comment, Feedback, Repositories, StoredPlanEntry } from "@activen/db";
import {
  activityMix,
  addDays,
  canDisplay,
  emptySummary,
  kpis,
  localDateOf,
  matchPlanToActivities,
  summarize,
  weekStart,
  type Activity,
  type Audience,
  type LocalDate,
} from "@activen/domain";
import { Inject, Injectable } from "@nestjs/common";
import { REPOSITORIES } from "../tokens.js";

const toPlanDto = ({ language: _l, ...e }: StoredPlanEntry): PlanEntryDto => e;

const toFeedbackDto = (f: Feedback | undefined): FeedbackDto | null =>
  f
    ? {
        perceivedEffort: f.perceivedEffort,
        feel: f.feel,
        comment: f.comment,
        updatedAt: f.updatedAt.toISOString(),
      }
    : null;

/** A planned workout counted as missed: in the past, not a rest day, no activity linked. */
const isMissed = (entry: PlanEntryDto, linkedActivityId: string | null, today: LocalDate) =>
  entry.kind === "workout" && entry.calendarDate < today && linkedActivityId === null;

/**
 * Builds the training views shared by the athlete and the coach. Vendor data-sharing rules
 * (ADR-0003) are applied here: a coach never receives activities from sources that forbid it.
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
    const overrides = await this.repos.plans.overridesFor(entries.map((e) => e.id));
    const links = matchPlanToActivities(entries, activities, overrides);
    const feedback = await this.repos.feedback.forActivities(activities.map((a) => a.id));
    return {
      athleteId,
      from,
      to,
      entries,
      activities: activities.map((a) => ({ ...a, feedback: toFeedbackDto(feedback.get(a.id)) })),
      links,
      activitiesVisible,
    };
  }

  async activities(athleteId: string, from: LocalDate, to: LocalDate): Promise<ActivityDto[]> {
    const list = await this.visibleActivities(athleteId, from, to, "owner");
    const feedback = await this.repos.feedback.forActivities(list.map((a) => a.id));
    return list
      .map((a) => ({ ...a, feedback: toFeedbackDto(feedback.get(a.id)) }))
      .sort((a, b) => b.startTimeInSeconds - a.startTimeInSeconds);
  }

  async activityDetail(athleteId: string, activityId: string): Promise<ActivityDetailDto> {
    const activity = await this.repos.activities.get(athleteId, activityId);
    const calendar = await this.calendar(
      athleteId,
      activity.calendarDate,
      activity.calendarDate,
      "owner",
    );
    const link = calendar.links.find((l) => l.activityId === activityId);
    const dto = calendar.activities.find((a) => a.id === activityId) ?? {
      ...activity,
      feedback: null,
    };
    return {
      activity: dto,
      planEntry: calendar.entries.find((e) => e.id === link?.planEntryId) ?? null,
      comments: await this.comments(athleteId, { activityId }),
    };
  }

  async progress(athleteId: string, weeks: number, audience: Audience): Promise<ProgressDto> {
    const today = await this.today(athleteId);
    const firstWeek = addDays(weekStart(today), -7 * (weeks - 1));
    const list = await this.visibleActivities(athleteId, addDays(firstWeek, -28), today, audience);
    const byKey = new Map(summarize(list, "week").map((s) => [s.key, s]));
    const series = Array.from({ length: weeks }, (_, i) => {
      const key = addDays(firstWeek, 7 * i);
      return byKey.get(key) ?? emptySummary(key, "week");
    });
    const last4From = addDays(today, -27);
    return {
      weeks: series,
      last4Weeks: kpis(list, { from: last4From, to: today }),
      previous4Weeks: kpis(list, { from: addDays(last4From, -28), to: addDays(last4From, -1) }),
      mix: activityMix(list, { from: last4From, to: today }),
    };
  }

  async comments(
    athleteId: string,
    options: { activityId?: string; before?: Date } = {},
  ): Promise<CommentDto[]> {
    const list = await this.repos.comments.list(athleteId, options);
    return this.commentDtos(list);
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

  /** One row of the coach's athlete list, with the signals that put it on the attention list. */
  async coachAthlete(
    link: { id: string; athleteId: string; status: "invited" | "active" | "ended" },
    displayName: string,
    scopes: CoachAthleteDto["scopes"],
  ): Promise<CoachAthleteDto> {
    const base: CoachAthleteDto = {
      linkId: link.id,
      athleteId: link.athleteId,
      displayName,
      status: link.status === "active" ? "active" : "invited",
      scopes,
      primarySource: null,
      week: { planned: 0, completed: 0 },
      lastActivity: null,
      signals: [],
      lastComment: null,
    };
    if (link.status !== "active") return base;

    const settings = await this.repos.settings.get(link.athleteId);
    base.primarySource = settings.sourcePriority[0] ?? null;
    const today = localDateOf(new Date().toISOString(), settings.timeZone);
    const monday = weekStart(today);
    const from = addDays(today, -7) < monday ? addDays(today, -7) : monday;
    const calendar = await this.calendar(
      link.athleteId,
      from,
      addDays(monday, 6),
      "coach",
      scopes.includes("activities"),
    );
    const linked = new Map(calendar.links.map((l) => [l.planEntryId, l.activityId]));
    const thisWeek = calendar.entries.filter(
      (e) => e.calendarDate >= monday && e.kind === "workout",
    );
    base.week = {
      planned: thisWeek.length,
      completed: thisWeek.filter((e) => linked.get(e.id)).length,
    };

    const signals: CoachSignal[] = [];
    if (calendar.activitiesVisible) {
      const missed = calendar.entries.filter(
        (e) => e.calendarDate >= addDays(today, -7) && isMissed(e, linked.get(e.id) ?? null, today),
      ).length;
      if (missed > 0) signals.push({ code: "missed_sessions", count: missed });
      // Heuristic until Training Effect is synced: high effort on a session with a low load.
      const hard = calendar.activities.find(
        (a) =>
          a.calendarDate >= addDays(today, -7) &&
          (a.feedback?.perceivedEffort ?? 0) >= 8 &&
          (a.trainingLoad ?? 0) < 100,
      );
      if (hard)
        signals.push({
          code: "high_effort_on_easy_day",
          perceivedEffort: hard.feedback?.perceivedEffort ?? 0,
          calendarDate: hard.calendarDate,
        });
      const last = calendar.activities.at(-1);
      if (last)
        base.lastActivity = {
          calendarDate: last.calendarDate,
          activityType: last.activityType,
          distanceInMeters: last.distanceInMeters,
          durationInSeconds: last.durationInSeconds,
          perceivedEffort: last.feedback?.perceivedEffort ?? null,
        };
    }
    const [lastComment] = await this.repos.comments.list(link.athleteId, { limit: 1 });
    if (lastComment) {
      const fromAthlete = lastComment.authorId === link.athleteId;
      base.lastComment = {
        body: lastComment.body,
        createdAt: lastComment.createdAt.toISOString(),
        fromAthlete,
      };
      if (fromAthlete) signals.push({ code: "awaiting_reply" });
    }
    base.signals = signals;
    return base;
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
