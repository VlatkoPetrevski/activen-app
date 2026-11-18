import { addDays, monthKey, weekStart, yearKey } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { filterActivities, isRunning, type ActivityFilter } from "./sport.js";
import type { Activity, HrZoneProfile, LocalDate, Vendor } from "./types.js";

export type SummaryPeriod = "week" | "month" | "year";

/** Which duration feeds the weighted running pace. The reference report uses elapsed time. */
export type PaceBasis = "elapsed" | "moving";

export interface SummaryOptions {
  paceBasis?: PaceBasis;
  /** When given, elapsed time per HR zone is reported (time in HR zones). */
  hrProfiles?: readonly HrZoneProfile[];
  /** Preferred HR-zone sources, see `profileForDate`. */
  zoneSourcePreference?: readonly Vendor[];
  /** Which activities are counted (e.g. running only, without treadmill). Default: all. */
  filter?: ActivityFilter;
}

export interface PeriodSummary {
  period: SummaryPeriod;
  /** Week: Monday date; month: `YYYY-MM`; year: `YYYY`. */
  key: string;
  from: LocalDate;
  to: LocalDate;
  activityCount: number;
  runningActivityCount: number;
  /** Sum of all activity distances. */
  distanceInMeters: number;
  runningDistanceInMeters: number;
  durationInSeconds: number;
  runningDurationInSeconds: number;
  totalElevationGainInMeters: number;
  /** Weighted: total running time / total running distance. `null` without running distance. */
  runningPaceInSecondsPerKilometer: number | null;
  /** Mean of available average-HR values. */
  averageHeartRateInBeatsPerMinute: number | null;
  /** Sum of Training Load (Garmin principle: exercise loads add up into the period load). */
  totalTrainingLoad: number;
  /** Mean of available per-activity Training Load values. */
  averageTrainingLoad: number | null;
  /** Mean of available per-activity max HR values (as in the reference report). */
  averageMaxHeartRateInBeatsPerMinute: number | null;
  /** Highest max HR in the period. */
  maxHeartRateInBeatsPerMinute: number | null;
  /** Mean of available average-power values. */
  averagePowerInWatts: number | null;
  /** Sum of available activeKilocalories. */
  activeKilocalories: number;
  /** Elapsed seconds per zone name; activities without HR count under `UNCLASSIFIED_ZONE`. */
  timeInHeartRateZonesInSeconds: Record<string, number> | null;
}

function periodKey(date: LocalDate, period: SummaryPeriod): string {
  switch (period) {
    case "week":
      return weekStart(date);
    case "month":
      return monthKey(date);
    case "year":
      return yearKey(date);
  }
}

function periodRange(key: string, period: SummaryPeriod): { from: LocalDate; to: LocalDate } {
  switch (period) {
    case "week":
      return { from: key, to: addDays(key, 6) };
    case "month": {
      const from = `${key}-01`;
      const [y, m] = key.split("-").map(Number) as [number, number];
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from, to: `${key}-${lastDay.toString().padStart(2, "0")}` };
    }
    case "year":
      return { from: `${key}-01-01`, to: `${key}-12-31` };
  }
}

/** A summary with no actual activity, e.g. a week that only has planned entries. */
export function emptySummary(key: string, period: SummaryPeriod, withZones = false): PeriodSummary {
  return {
    period,
    key,
    ...periodRange(key, period),
    activityCount: 0,
    runningActivityCount: 0,
    distanceInMeters: 0,
    runningDistanceInMeters: 0,
    durationInSeconds: 0,
    runningDurationInSeconds: 0,
    totalElevationGainInMeters: 0,
    runningPaceInSecondsPerKilometer: null,
    averageHeartRateInBeatsPerMinute: null,
    totalTrainingLoad: 0,
    averageTrainingLoad: null,
    averageMaxHeartRateInBeatsPerMinute: null,
    maxHeartRateInBeatsPerMinute: null,
    averagePowerInWatts: null,
    activeKilocalories: 0,
    timeInHeartRateZonesInSeconds: withZones ? {} : null,
  };
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;

export const UNCLASSIFIED_ZONE = "unclassified";

/**
 * Aggregates actual activities per week (Mon–Sun), calendar month or calendar year (spec §10).
 * Deleted activities and plan entries never contribute. Result is ordered newest period first.
 */
export function summarize(
  activities: readonly Activity[],
  period: SummaryPeriod,
  options: SummaryOptions = {},
): PeriodSummary[] {
  const paceBasis = options.paceBasis ?? "elapsed";
  const groups = new Map<string, Activity[]>();
  for (const a of filterActivities(activities, options.filter)) {
    if (a.deleted) continue;
    const key = periodKey(a.calendarDate, period);
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }

  const summaries: PeriodSummary[] = [];
  for (const [key, list] of groups) {
    let distanceInMeters = 0;
    let runningDistanceInMeters = 0;
    let durationInSeconds = 0;
    let runningDurationInSeconds = 0;
    let totalElevationGainInMeters = 0;
    let paceTimeS = 0;
    let paceDistanceM = 0;
    let runningActivityCount = 0;
    const hrs: number[] = [];
    const loads: number[] = [];
    const maxHrs: number[] = [];
    const watts: number[] = [];
    let activeKilocalories = 0;
    const timeInHeartRateZonesInSeconds: Record<string, number> | null = options.hrProfiles
      ? {}
      : null;

    for (const a of list) {
      distanceInMeters += a.distanceInMeters ?? 0;
      durationInSeconds += a.durationInSeconds;
      totalElevationGainInMeters += a.totalElevationGainInMeters ?? 0;
      if (a.averageHeartRateInBeatsPerMinute !== null) hrs.push(a.averageHeartRateInBeatsPerMinute);
      if (a.trainingLoad !== null) loads.push(a.trainingLoad);
      if (a.maxHeartRateInBeatsPerMinute !== null) maxHrs.push(a.maxHeartRateInBeatsPerMinute);
      if (a.averagePowerInWatts !== null) watts.push(a.averagePowerInWatts);
      activeKilocalories += a.activeKilocalories ?? 0;

      if (isRunning(a.activityType)) {
        runningActivityCount += 1;
        runningDistanceInMeters += a.distanceInMeters ?? 0;
        runningDurationInSeconds += a.durationInSeconds;
        if (a.distanceInMeters !== null && a.distanceInMeters > 0) {
          paceDistanceM += a.distanceInMeters;
          paceTimeS +=
            paceBasis === "moving"
              ? (a.movingDurationInSeconds ?? a.durationInSeconds)
              : a.durationInSeconds;
        }
      }

      if (timeInHeartRateZonesInSeconds && options.hrProfiles) {
        const profile = profileForDate(
          options.hrProfiles,
          a.calendarDate,
          options.zoneSourcePreference,
        );
        const zone = profile ? classifyHr(a.averageHeartRateInBeatsPerMinute, profile.zones) : null;
        const zoneName = zone?.name ?? UNCLASSIFIED_ZONE;
        timeInHeartRateZonesInSeconds[zoneName] =
          (timeInHeartRateZonesInSeconds[zoneName] ?? 0) + a.durationInSeconds;
      }
    }

    summaries.push({
      period,
      key,
      ...periodRange(key, period),
      activityCount: list.length,
      runningActivityCount,
      distanceInMeters,
      runningDistanceInMeters,
      durationInSeconds,
      runningDurationInSeconds,
      totalElevationGainInMeters,
      runningPaceInSecondsPerKilometer:
        paceDistanceM > 0 ? paceTimeS / (paceDistanceM / 1000) : null,
      averageHeartRateInBeatsPerMinute: mean(hrs),
      totalTrainingLoad: loads.reduce((sum, v) => sum + v, 0),
      averageTrainingLoad: mean(loads),
      averageMaxHeartRateInBeatsPerMinute: mean(maxHrs),
      maxHeartRateInBeatsPerMinute: maxHrs.length > 0 ? Math.max(...maxHrs) : null,
      averagePowerInWatts: mean(watts),
      activeKilocalories,
      timeInHeartRateZonesInSeconds,
    });
  }

  return summaries.sort((a, b) => b.key.localeCompare(a.key));
}
