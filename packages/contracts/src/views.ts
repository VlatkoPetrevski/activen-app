/**
 * Pure builders for the API's composite views. The server calls them with data from the database;
 * the web demo calls them with demo data — so both compute exactly the same thing.
 */
import {
  activityGroup,
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
  ActivityLapDto,
  LapIntensity,
  ActivityInsight,
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
    week: { planned: 0, completed: 0, plannedDistanceInMeters: 0 },
    weekTotals: null,
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
    plannedDistanceInMeters: thisWeek.reduce((sum, e) => sum + (e.plannedDistanceInMeters ?? 0), 0),
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
    const recorded = calendar.activities.filter(
      (a) => a.calendarDate >= monday && a.calendarDate <= today,
    );
    row.weekTotals = {
      distanceInMeters: recorded.reduce((sum, a) => sum + (a.distanceInMeters ?? 0), 0),
      durationInSeconds: recorded.reduce((sum, a) => sum + (a.durationInSeconds ?? 0), 0),
      count: recorded.length,
    };
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

const INSIGHT_WINDOW_DAYS = 28;
const MIN_SAMPLES = 3;

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Automatic narrative for one activity (like Strava's summaries): how it compares with the plan and
 * with the same kind of activity over the previous 4 weeks. At most `limit` observations, most
 * relevant first; nothing is said without enough history to compare.
 */
export function activityInsights(
  activity: Activity,
  recent: readonly Activity[],
  planEntry: Pick<PlanEntryDto, "plannedDistanceInMeters"> | null,
  limit = 3,
): ActivityInsight[] {
  const out: ActivityInsight[] = [];
  const from = addDays(activity.calendarDate, -INSIGHT_WINDOW_DAYS);
  const group = activityGroup(activity.activityType);
  const peers = recent.filter(
    (a) =>
      a.id !== activity.id &&
      !a.deleted &&
      a.calendarDate >= from &&
      a.calendarDate <= activity.calendarDate &&
      activityGroup(a.activityType) === group,
  );

  const planned = planEntry?.plannedDistanceInMeters ?? null;
  if (planned && activity.distanceInMeters) {
    const diff = Math.round(((activity.distanceInMeters - planned) / planned) * 100);
    if (Math.abs(diff) <= 5) out.push({ code: "plan_on_target" });
    else if (diff > 0) out.push({ code: "plan_over", percent: diff });
    else out.push({ code: "plan_under", percent: -diff });
  }

  const distances = peers.map((a) => a.distanceInMeters ?? 0).filter((d) => d > 0);
  if (
    activity.distanceInMeters &&
    distances.length >= MIN_SAMPLES &&
    activity.distanceInMeters > Math.max(...distances)
  )
    out.push({ code: "longest_recent" });

  const pace = (a: Activity) =>
    a.distanceInMeters && a.durationInSeconds && a.distanceInMeters > 1000
      ? a.durationInSeconds / (a.distanceInMeters / 1000)
      : null;
  const myPace = group === "running" ? pace(activity) : null;
  const paces = peers.map(pace).filter((p): p is number => p !== null);
  if (myPace !== null && paces.length >= MIN_SAMPLES) {
    const delta = Math.round(avg(paces) - myPace);
    if (delta >= 8) out.push({ code: "pace_faster", secondsPerKm: delta });
    else if (delta <= -8) out.push({ code: "pace_slower", secondsPerKm: -delta });
  }

  const hrs = peers
    .map((a) => a.averageHeartRateInBeatsPerMinute)
    .filter((h): h is number => h !== null && h > 0);
  const hr = activity.averageHeartRateInBeatsPerMinute;
  if (hr && hrs.length >= MIN_SAMPLES) {
    const delta = Math.round(hr - avg(hrs));
    // Lower HR at the same or faster pace means better aerobic economy.
    if (delta <= -5 && (myPace === null || paces.length < MIN_SAMPLES || myPace <= avg(paces)))
      out.push({ code: "lower_hr", bpm: -delta });
    else if (delta >= 6) out.push({ code: "higher_hr", bpm: delta });
  }

  const loads = peers.map((a) => a.trainingLoad).filter((l): l is number => l !== null && l > 0);
  if (
    activity.trainingLoad &&
    loads.length >= MIN_SAMPLES &&
    activity.trainingLoad >= 1.4 * avg(loads)
  )
    out.push({ code: "big_load" });

  const climb = activity.totalElevationGainInMeters ?? 0;
  if (climb >= (group === "cycling" ? 800 : 300))
    out.push({ code: "hilly", meters: Math.round(climb) });

  return out.slice(0, limit);
}

/** Totals of the laps of one intensity, e.g. "10 intervals · 3,1 km · 10:02 · HR 168 / 181". */
export interface LapGroup {
  intensity: LapIntensity;
  count: number;
  distanceInMeters: number | null;
  durationInSeconds: number;
  /** Time-weighted average over the laps that have heart rate. */
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
}

const LAP_ORDER: LapIntensity[] = ["warmup", "active", "recovery", "rest", "cooldown"];

/** Warm-up / intervals / recovery / rest / cool-down totals, in workout order. */
export function lapBreakdown(laps: readonly ActivityLapDto[]): LapGroup[] {
  return LAP_ORDER.flatMap((intensity) => {
    const group = laps.filter((l) => l.intensity === intensity);
    if (group.length === 0) return [];
    const withHr = group.filter((l) => l.averageHeartRateInBeatsPerMinute !== null);
    const hrTime = withHr.reduce((sum, l) => sum + l.durationInSeconds, 0);
    const maxes = group.flatMap((l) =>
      l.maxHeartRateInBeatsPerMinute === null ? [] : [l.maxHeartRateInBeatsPerMinute],
    );
    const distances = group.flatMap((l) =>
      l.distanceInMeters === null ? [] : [l.distanceInMeters],
    );
    return [
      {
        intensity,
        count: group.length,
        distanceInMeters: distances.length ? distances.reduce((a, b) => a + b, 0) : null,
        durationInSeconds: group.reduce((sum, l) => sum + l.durationInSeconds, 0),
        averageHeartRateInBeatsPerMinute: hrTime
          ? Math.round(
              withHr.reduce(
                (sum, l) => sum + (l.averageHeartRateInBeatsPerMinute ?? 0) * l.durationInSeconds,
                0,
              ) / hrTime,
            )
          : null,
        maxHeartRateInBeatsPerMinute: maxes.length ? Math.max(...maxes) : null,
      },
    ];
  });
}
