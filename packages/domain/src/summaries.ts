import { addDays, monthKey, weekStart, yearKey } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { filterActivities, isRun, type ActivityFilter } from "./sport.js";
import type { Activity, HrZoneProfile, LocalDate, Vendor } from "./types.js";

export type SummaryPeriod = "week" | "month" | "year";

/** Which duration feeds the weighted running pace. The reference report uses elapsed time. */
export type PaceBasis = "elapsed" | "moving";

export interface SummaryOptions {
  paceBasis?: PaceBasis;
  /** When given, elapsed time per HR zone is reported (zone distribution, spec §12.5). */
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
  runCount: number;
  /** Sum of all activity distances. */
  totalDistanceM: number;
  runDistanceM: number;
  totalElapsedS: number;
  runElapsedS: number;
  elevationGainM: number;
  /** Weighted: total running time / total running distance. `null` without running distance. */
  runPaceSPerKm: number | null;
  /** Mean of available average-HR values. */
  avgHr: number | null;
  /** Mean of available Relative Effort values. */
  avgRelativeEffort: number | null;
  /** Mean of available per-activity max HR values (as in the reference report). */
  avgMaxHr: number | null;
  /** Highest max HR in the period. */
  peakMaxHr: number | null;
  /** Mean of available average-power values. */
  avgWatts: number | null;
  /** Sum of available calories. */
  totalCalories: number;
  /** Elapsed seconds per zone name; activities without HR count under `UNCLASSIFIED_ZONE`. */
  zoneElapsedS: Record<string, number> | null;
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
    runCount: 0,
    totalDistanceM: 0,
    runDistanceM: 0,
    totalElapsedS: 0,
    runElapsedS: 0,
    elevationGainM: 0,
    runPaceSPerKm: null,
    avgHr: null,
    avgRelativeEffort: null,
    avgMaxHr: null,
    peakMaxHr: null,
    avgWatts: null,
    totalCalories: 0,
    zoneElapsedS: withZones ? {} : null,
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
    const key = periodKey(a.localDate, period);
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }

  const summaries: PeriodSummary[] = [];
  for (const [key, list] of groups) {
    let totalDistanceM = 0;
    let runDistanceM = 0;
    let totalElapsedS = 0;
    let runElapsedS = 0;
    let elevationGainM = 0;
    let paceTimeS = 0;
    let paceDistanceM = 0;
    let runCount = 0;
    const hrs: number[] = [];
    const efforts: number[] = [];
    const maxHrs: number[] = [];
    const watts: number[] = [];
    let totalCalories = 0;
    const zoneElapsedS: Record<string, number> | null = options.hrProfiles ? {} : null;

    for (const a of list) {
      totalDistanceM += a.distanceM ?? 0;
      totalElapsedS += a.elapsedTimeS;
      elevationGainM += a.elevationGainM ?? 0;
      if (a.avgHr !== null) hrs.push(a.avgHr);
      if (a.relativeEffort !== null) efforts.push(a.relativeEffort);
      if (a.maxHr !== null) maxHrs.push(a.maxHr);
      if (a.avgWatts !== null) watts.push(a.avgWatts);
      totalCalories += a.calories ?? 0;

      if (isRun(a.sportType)) {
        runCount += 1;
        runDistanceM += a.distanceM ?? 0;
        runElapsedS += a.elapsedTimeS;
        if (a.distanceM !== null && a.distanceM > 0) {
          paceDistanceM += a.distanceM;
          paceTimeS += paceBasis === "moving" ? (a.movingTimeS ?? a.elapsedTimeS) : a.elapsedTimeS;
        }
      }

      if (zoneElapsedS && options.hrProfiles) {
        const profile = profileForDate(
          options.hrProfiles,
          a.localDate,
          options.zoneSourcePreference,
        );
        const zone = profile ? classifyHr(a.avgHr, profile.zones) : null;
        const zoneName = zone?.name ?? UNCLASSIFIED_ZONE;
        zoneElapsedS[zoneName] = (zoneElapsedS[zoneName] ?? 0) + a.elapsedTimeS;
      }
    }

    summaries.push({
      period,
      key,
      ...periodRange(key, period),
      activityCount: list.length,
      runCount,
      totalDistanceM,
      runDistanceM,
      totalElapsedS,
      runElapsedS,
      elevationGainM,
      runPaceSPerKm: paceDistanceM > 0 ? paceTimeS / (paceDistanceM / 1000) : null,
      avgHr: mean(hrs),
      avgRelativeEffort: mean(efforts),
      avgMaxHr: mean(maxHrs),
      peakMaxHr: maxHrs.length > 0 ? Math.max(...maxHrs) : null,
      avgWatts: mean(watts),
      totalCalories,
      zoneElapsedS,
    });
  }

  return summaries.sort((a, b) => b.key.localeCompare(a.key));
}
