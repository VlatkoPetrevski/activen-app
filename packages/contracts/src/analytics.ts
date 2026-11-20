/**
 * Coach analytics: what a coach needs to see in seconds (compliance, load, spikes, effort,
 * form) and the detail behind it. Pure functions over a calendar, shared by the API and the
 * demo so both always agree.
 *
 * Load monitoring follows current practice:
 * - Acute:chronic load ratio (7 days vs. 28-day weekly average), sweet spot 0.8–1.3,
 *   elevated above 1.3, high above 1.5 (IOC consensus; Gabbett).
 * - Single-session spike: a run more than 10 % longer than the longest run of the previous
 *   30 days (Frandsen et al., BJSM 2025) — a stronger injury signal than weekly mileage.
 * - Fitness / fatigue / form: exponentially weighted load, 42 and 7 days (Banister model,
 *   the TrainingPeaks Performance Management Chart).
 */
import { activityGroup, addDays, weekStart, type LocalDate } from "@activen/domain";
import type { ActivityDto, CalendarDto, ConsentScope, WellnessDto } from "./responses.js";

export type ComplianceState = "done" | "partial" | "missed" | "planned" | "rest" | "extra" | "none";
export type LoadRatioLevel = "low" | "optimal" | "elevated" | "high";

export interface ComplianceDay {
  date: LocalDate;
  state: ComplianceState;
}

/** Why an athlete is at the top of the coach's list. */
export type AnalyticsFlag =
  | { code: "load_high"; ratio: number }
  | { code: "load_elevated"; ratio: number }
  | { code: "long_run_spike"; percent: number }
  | { code: "low_compliance"; percent: number }
  | { code: "hard_efforts"; count: number }
  | { code: "inactive"; days: number };

export interface AnalyticsSummaryDto {
  athleteId: string;
  displayName: string;
  scopes: ConsentScope[];
  /** False when the athlete has not shared activities: only the plan is known. */
  activitiesVisible: boolean;
  /** The last 7 days, oldest first: what was planned and what was done. */
  last7: ComplianceDay[];
  /** Planned sessions done in the last 28 days. */
  completion28: { done: number; planned: number };
  /** Distance per week for the last 8 weeks (oldest first, current week to date last). */
  weeklyDistance: number[];
  /** Training load of the last 7 days over the weekly average of the last 28. */
  loadRatio: { value: number; level: LoadRatioLevel } | null;
  /** Longest run of the last 7 days against the longest of the 30 days before. */
  longRunSpike: {
    distanceInMeters: number;
    previousLongestInMeters: number;
    percent: number;
  } | null;
  /** Average RPE and sessions rated 8+ in the last 7 days. */
  effort7: { averageRpe: number | null; hard: number; rated: number };
  /** Form (fitness − fatigue) today; positive is fresh, very negative is tired. */
  form: number | null;
  lastActivityDate: LocalDate | null;
  flags: AnalyticsFlag[];
}

export interface AnalyticsWeek {
  weekStart: LocalDate;
  distanceInMeters: number;
  durationInSeconds: number;
  load: number;
  sessionsDone: number;
  sessionsPlanned: number;
}

export interface FitnessPoint {
  date: LocalDate;
  fitness: number;
  fatigue: number;
  form: number;
}

export interface AthleteAnalyticsDto {
  summary: AnalyticsSummaryDto;
  /** Last 12 weeks, oldest first. */
  weeks: AnalyticsWeek[];
  /** Daily fitness / fatigue / form for the last 12 weeks. */
  fitness: FitnessPoint[];
  /** Last 28 days by sport. */
  byGroup: { group: string; distanceInMeters: number; durationInSeconds: number; count: number }[];
  /** Last 28 days by perceived effort: easy (RPE ≤ 4), moderate (5–6), hard (7+). */
  effort: { easy: number; moderate: number; hard: number; unrated: number };
  /** Morning wellness of the last 14 days; null when the athlete does not share it. */
  wellness: WellnessDto[] | null;
  /** Activities of the last 12 weeks, newest first. */
  activities: ActivityDto[];
}

/** Days of history needed: 12 weeks shown plus 6 weeks to warm up the 42-day fitness. */
export const ANALYTICS_HISTORY_DAYS = 12 * 7 + 42;

/** Calendar range the analytics need, ending with the current week (plan ahead included). */
export function analyticsRange(today: LocalDate): { from: LocalDate; to: LocalDate } {
  return { from: addDays(today, -ANALYTICS_HISTORY_DAYS + 1), to: addDays(weekStart(today), 6) };
}

const visible = (c: CalendarDto) => c.activities.filter((a) => !a.deleted);
const isRun = (a: ActivityDto) => activityGroup(a.activityType) === "running";

/**
 * Training load of one activity: Garmin Training Load when present, otherwise session RPE
 * (minutes × RPE / 3, close to Garmin's scale), otherwise minutes.
 */
export function sessionLoad(a: ActivityDto): number {
  if (a.trainingLoad !== null) return a.trainingLoad;
  const minutes = a.durationInSeconds / 60;
  const rpe = a.feedback?.perceivedEffort;
  return rpe ? (minutes * rpe) / 3 : minutes;
}

function loadByDay(c: CalendarDto): Map<LocalDate, number> {
  const m = new Map<LocalDate, number>();
  for (const a of visible(c)) m.set(a.calendarDate, (m.get(a.calendarDate) ?? 0) + sessionLoad(a));
  return m;
}

function sumLoad(byDay: Map<LocalDate, number>, from: LocalDate, to: LocalDate): number {
  let s = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) s += byDay.get(d) ?? 0;
  return s;
}

export function loadRatioLevel(ratio: number): LoadRatioLevel {
  if (ratio > 1.5) return "high";
  if (ratio > 1.3) return "elevated";
  if (ratio < 0.8) return "low";
  return "optimal";
}

/** Fitness (42-day) and fatigue (7-day) exponentially weighted daily load; form = difference. */
export function fitnessSeries(c: CalendarDto, from: LocalDate, to: LocalDate): FitnessPoint[] {
  const byDay = loadByDay(c);
  let fitness = 0;
  let fatigue = 0;
  const out: FitnessPoint[] = [];
  for (let d = c.from; d <= to; d = addDays(d, 1)) {
    const load = byDay.get(d) ?? 0;
    // Form is yesterday's fitness minus fatigue: how fresh the athlete starts the day.
    const form = fitness - fatigue;
    fitness += (load - fitness) / 42;
    fatigue += (load - fatigue) / 7;
    if (d >= from)
      out.push({
        date: d,
        fitness: Math.round(fitness * 10) / 10,
        fatigue: Math.round(fatigue * 10) / 10,
        form: Math.round(form * 10) / 10,
      });
  }
  return out;
}

function complianceDay(c: CalendarDto, date: LocalDate, today: LocalDate): ComplianceState {
  const entries = c.entries.filter((e) => e.calendarDate === date);
  const workouts = entries.filter((e) => e.kind === "workout");
  const links = new Map(c.links.map((l) => [l.planEntryId, l.activityId]));
  const acts = visible(c).filter((a) => a.calendarDate === date);
  if (workouts.length === 0) return acts.length ? "extra" : entries.length ? "rest" : "none";
  const done = workouts.filter((e) => links.get(e.id)).length;
  if (done === workouts.length) return "done";
  if (date >= today || !c.activitiesVisible) return done ? "partial" : "planned";
  return done ? "partial" : "missed";
}

/** The roster row: everything a coach scans before opening an athlete. */
export function analyticsSummary(input: {
  athleteId: string;
  displayName: string;
  scopes: ConsentScope[];
  calendar: CalendarDto;
  today: LocalDate;
}): AnalyticsSummaryDto {
  const { calendar: c, today } = input;
  const acts = visible(c);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, state: complianceDay(c, date, today) };
  });

  const from28 = addDays(today, -27);
  const links = new Map(c.links.map((l) => [l.planEntryId, l.activityId]));
  // Today's session counts once it is done; until then it is not yet due.
  const due = c.entries.filter(
    (e) =>
      e.kind === "workout" &&
      e.calendarDate >= from28 &&
      (e.calendarDate < today || (e.calendarDate === today && links.get(e.id))),
  );
  const completion28 = { done: due.filter((e) => links.get(e.id)).length, planned: due.length };

  const thisWeek = weekStart(today);
  const weeklyDistance = Array.from({ length: 8 }, (_, i) => {
    const from = addDays(thisWeek, -7 * (7 - i));
    const to = addDays(from, 6);
    return acts
      .filter((a) => a.calendarDate >= from && a.calendarDate <= to && a.calendarDate <= today)
      .reduce((s, a) => s + (a.distanceInMeters ?? 0), 0);
  });

  const byDay = loadByDay(c);
  const acute = sumLoad(byDay, addDays(today, -6), today);
  const chronicWeekly = sumLoad(byDay, from28, today) / 4;
  const ratio = chronicWeekly > 0 ? Math.round((acute / chronicWeekly) * 100) / 100 : null;
  const loadRatio = ratio === null ? null : { value: ratio, level: loadRatioLevel(ratio) };

  const longest = (from: LocalDate, to: LocalDate) =>
    Math.max(
      0,
      ...acts
        .filter((a) => isRun(a) && a.calendarDate >= from && a.calendarDate <= to)
        .map((a) => a.distanceInMeters ?? 0),
    );
  const recentLongest = longest(addDays(today, -6), today);
  const previousLongest = longest(addDays(today, -36), addDays(today, -7));
  const spikePercent =
    previousLongest > 0 ? Math.round((recentLongest / previousLongest - 1) * 100) : 0;
  const longRunSpike =
    previousLongest > 0 && spikePercent > 10
      ? {
          distanceInMeters: recentLongest,
          previousLongestInMeters: previousLongest,
          percent: spikePercent,
        }
      : null;

  const week = acts.filter((a) => a.calendarDate >= addDays(today, -6) && a.calendarDate <= today);
  const rpes = week.flatMap((a) =>
    a.feedback?.perceivedEffort ? [a.feedback.perceivedEffort] : [],
  );
  const effort7 = {
    averageRpe: rpes.length
      ? Math.round((rpes.reduce((s, v) => s + v, 0) / rpes.length) * 10) / 10
      : null,
    hard: rpes.filter((v) => v >= 8).length,
    rated: rpes.length,
  };

  const fit = c.activitiesVisible ? fitnessSeries(c, today, today)[0] : undefined;
  const lastActivityDate =
    acts
      .filter((a) => a.calendarDate <= today)
      .map((a) => a.calendarDate)
      .sort()
      .at(-1) ?? null;

  const flags: AnalyticsFlag[] = [];
  if (c.activitiesVisible) {
    if (loadRatio?.level === "high") flags.push({ code: "load_high", ratio: loadRatio.value });
    if (loadRatio?.level === "elevated")
      flags.push({ code: "load_elevated", ratio: loadRatio.value });
    if (longRunSpike) flags.push({ code: "long_run_spike", percent: longRunSpike.percent });
    const pct = completion28.planned ? (completion28.done / completion28.planned) * 100 : 100;
    if (completion28.planned >= 4 && pct < 70)
      flags.push({ code: "low_compliance", percent: Math.round(pct) });
    if (effort7.hard >= 2) flags.push({ code: "hard_efforts", count: effort7.hard });
    const idle = lastActivityDate
      ? Math.round((Date.parse(today) - Date.parse(lastActivityDate)) / 86_400_000)
      : null;
    if (idle !== null && idle >= 5) flags.push({ code: "inactive", days: idle });
  }

  return {
    athleteId: input.athleteId,
    displayName: input.displayName,
    scopes: input.scopes,
    activitiesVisible: c.activitiesVisible,
    last7,
    completion28,
    weeklyDistance: c.activitiesVisible ? weeklyDistance : [],
    loadRatio: c.activitiesVisible ? loadRatio : null,
    longRunSpike: c.activitiesVisible ? longRunSpike : null,
    effort7,
    form: fit ? Math.round(fit.form) : null,
    lastActivityDate: c.activitiesVisible ? lastActivityDate : null,
    flags,
  };
}

/** Everything on the athlete's analytics page. */
export function athleteAnalytics(input: {
  athleteId: string;
  displayName: string;
  scopes: ConsentScope[];
  calendar: CalendarDto;
  today: LocalDate;
  /** Null when the athlete does not share sleep and recovery. */
  wellness: WellnessDto[] | null;
}): AthleteAnalyticsDto {
  const { calendar: c, today } = input;
  const acts = visible(c);
  const summary = analyticsSummary(input);
  const first = addDays(weekStart(today), -7 * 11);
  const links = new Map(c.links.map((l) => [l.planEntryId, l.activityId]));
  const weeks = Array.from({ length: 12 }, (_, i): AnalyticsWeek => {
    const from = addDays(first, 7 * i);
    const to = addDays(from, 6);
    const inWeek = acts.filter((a) => a.calendarDate >= from && a.calendarDate <= to);
    const planned = c.entries.filter(
      (e) => e.kind === "workout" && e.calendarDate >= from && e.calendarDate <= to,
    );
    return {
      weekStart: from,
      distanceInMeters: inWeek.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0),
      durationInSeconds: inWeek.reduce((s, a) => s + a.durationInSeconds, 0),
      load: Math.round(inWeek.reduce((s, a) => s + sessionLoad(a), 0)),
      sessionsDone: planned.filter((e) => links.get(e.id)).length,
      sessionsPlanned: planned.length,
    };
  });

  const from28 = addDays(today, -27);
  const recent = acts.filter((a) => a.calendarDate >= from28 && a.calendarDate <= today);
  const groups = new Map<string, AthleteAnalyticsDto["byGroup"][number]>();
  for (const a of recent) {
    const group = activityGroup(a.activityType);
    const g = groups.get(group) ?? { group, distanceInMeters: 0, durationInSeconds: 0, count: 0 };
    g.distanceInMeters += a.distanceInMeters ?? 0;
    g.durationInSeconds += a.durationInSeconds;
    g.count += 1;
    groups.set(group, g);
  }
  const effort = { easy: 0, moderate: 0, hard: 0, unrated: 0 };
  for (const a of recent) {
    const r = a.feedback?.perceivedEffort;
    if (!r) effort.unrated++;
    else if (r <= 4) effort.easy++;
    else if (r <= 6) effort.moderate++;
    else effort.hard++;
  }

  return {
    summary,
    weeks: c.activitiesVisible
      ? weeks
      : weeks.map((w) => ({ ...w, distanceInMeters: 0, durationInSeconds: 0, load: 0 })),
    fitness: c.activitiesVisible ? fitnessSeries(c, addDays(today, -83), today) : [],
    byGroup: [...groups.values()].sort((a, b) => b.durationInSeconds - a.durationInSeconds),
    effort,
    wellness:
      input.wellness === null
        ? null
        : input.wellness
            .filter((w) => w.calendarDate > addDays(today, -14) && w.calendarDate <= today)
            .sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)),
    activities: acts
      .filter((a) => a.calendarDate <= today && a.calendarDate >= first)
      .sort((a, b) => b.startTimeInSeconds - a.startTimeInSeconds),
  };
}

/** Attention first: high load, spikes, low compliance, then by name. */
export function sortByAttention(rows: AnalyticsSummaryDto[]): AnalyticsSummaryDto[] {
  const weight = (r: AnalyticsSummaryDto) =>
    r.flags.reduce(
      (s, f) =>
        s +
        (
          {
            load_high: 5,
            long_run_spike: 4,
            load_elevated: 3,
            low_compliance: 3,
            hard_efforts: 2,
            inactive: 2,
          } as const
        )[f.code],
      0,
    );
  return [...rows].sort(
    (a, b) => weight(b) - weight(a) || a.displayName.localeCompare(b.displayName),
  );
}
