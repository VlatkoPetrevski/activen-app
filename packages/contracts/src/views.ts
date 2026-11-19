/**
 * Pure builders for the API's composite views. The server calls them with data from the database;
 * the web demo calls them with demo data — so both compute exactly the same thing.
 */
import {
  activityMix,
  addDays,
  emptySummary,
  kpis,
  matchPlanToActivities,
  summarize,
  weekStart,
  type Activity,
  type LocalDate,
  type PlanLinkOverride,
  type Vendor,
} from "@activen/domain";
import type {
  ActivityDto,
  CalendarDto,
  CoachAthleteDto,
  CoachSignal,
  ConsentScope,
  FeedbackDto,
  PlanEntryDto,
  ProgressDto,
} from "./responses.js";

export function calendarView(input: {
  athleteId: string;
  from: LocalDate;
  to: LocalDate;
  entries: PlanEntryDto[];
  activities: Activity[];
  overrides: PlanLinkOverride[];
  feedback: ReadonlyMap<string, FeedbackDto>;
  activitiesVisible: boolean;
}): CalendarDto {
  const activities = input.activitiesVisible ? input.activities : [];
  return {
    athleteId: input.athleteId,
    from: input.from,
    to: input.to,
    entries: input.entries,
    activities: activities.map((a) => ({ ...a, feedback: input.feedback.get(a.id) ?? null })),
    links: matchPlanToActivities(input.entries, activities, input.overrides),
    activitiesVisible: input.activitiesVisible,
  };
}

/** Weekly series (gaps filled), running KPIs for the last 4 weeks vs the 4 before, activity mix. */
export function progressView(
  activities: readonly Activity[],
  today: LocalDate,
  weeks: number,
): ProgressDto {
  const firstWeek = addDays(weekStart(today), -7 * (weeks - 1));
  const byKey = new Map(summarize(activities, "week").map((s) => [s.key, s]));
  const last4From = addDays(today, -27);
  return {
    weeks: Array.from({ length: weeks }, (_, i) => {
      const key = addDays(firstWeek, 7 * i);
      return byKey.get(key) ?? emptySummary(key, "week");
    }),
    last4Weeks: kpis(activities, { from: last4From, to: today }),
    previous4Weeks: kpis(activities, { from: addDays(last4From, -28), to: addDays(last4From, -1) }),
    mix: activityMix(activities, { from: last4From, to: today }),
  };
}

/** Date range the coach row needs: the last 7 days and the whole current week. */
export function coachRowRange(today: LocalDate): { from: LocalDate; to: LocalDate } {
  const monday = weekStart(today);
  const weekAgo = addDays(today, -7);
  return { from: weekAgo < monday ? weekAgo : monday, to: addDays(monday, 6) };
}

/**
 * One athlete in the coach's list, with the signals that put them on the attention list:
 * missed workouts in the last 7 days, a high effort on a low-load session (heuristic until
 * Training Effect is synced) and an unanswered message.
 */
export function coachRowView(input: {
  linkId: string;
  athleteId: string;
  displayName: string;
  status: "invited" | "active";
  scopes: ConsentScope[];
  primarySource: Vendor | null;
  today: LocalDate;
  /** Calendar for {@link coachRowRange}; omitted for invitations. */
  calendar?: CalendarDto;
  lastComment?: { body: string; createdAt: string; authorId: string | null } | null;
}): CoachAthleteDto {
  const row: CoachAthleteDto = {
    linkId: input.linkId,
    athleteId: input.athleteId,
    displayName: input.displayName,
    status: input.status,
    scopes: input.scopes,
    primarySource: input.status === "active" ? input.primarySource : null,
    week: { planned: 0, completed: 0 },
    lastActivity: null,
    signals: [],
    lastComment: null,
  };
  const { calendar, today } = input;
  if (input.status !== "active" || !calendar) return row;

  const monday = weekStart(today);
  const weekAgo = addDays(today, -7);
  const linked = new Map(calendar.links.map((l) => [l.planEntryId, l.activityId]));
  const thisWeek = calendar.entries.filter((e) => e.calendarDate >= monday && e.kind === "workout");
  row.week = {
    planned: thisWeek.length,
    completed: thisWeek.filter((e) => linked.get(e.id)).length,
  };

  const signals: CoachSignal[] = [];
  if (calendar.activitiesVisible) {
    const missed = calendar.entries.filter(
      (e) =>
        e.kind === "workout" &&
        e.calendarDate >= weekAgo &&
        e.calendarDate < today &&
        !linked.get(e.id),
    ).length;
    if (missed > 0) signals.push({ code: "missed_sessions", count: missed });
    const hard = calendar.activities.find(
      (a: ActivityDto) =>
        a.calendarDate >= weekAgo &&
        (a.feedback?.perceivedEffort ?? 0) >= 8 &&
        (a.trainingLoad ?? 0) < 100,
    );
    if (hard)
      signals.push({
        code: "high_effort_on_easy_day",
        perceivedEffort: hard.feedback?.perceivedEffort ?? 0,
        calendarDate: hard.calendarDate,
      });
    const last = calendar.activities
      .filter((a) => a.calendarDate <= today)
      .reduce<ActivityDto | undefined>(
        (newest, a) => (!newest || a.startTimeInSeconds > newest.startTimeInSeconds ? a : newest),
        undefined,
      );
    if (last)
      row.lastActivity = {
        calendarDate: last.calendarDate,
        activityType: last.activityType,
        distanceInMeters: last.distanceInMeters,
        durationInSeconds: last.durationInSeconds,
        perceivedEffort: last.feedback?.perceivedEffort ?? null,
      };
  }
  if (input.lastComment) {
    const fromAthlete = input.lastComment.authorId === input.athleteId;
    row.lastComment = {
      body: input.lastComment.body,
      createdAt: input.lastComment.createdAt,
      fromAthlete,
    };
    if (fromAthlete) signals.push({ code: "awaiting_reply" });
  }
  row.signals = signals;
  return row;
}
