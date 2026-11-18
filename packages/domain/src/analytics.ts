import { DAY_NAMES, weekdayIndex, type DayName } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { filterActivities, PRESET_FILTERS, type ActivityFilter } from "./sport.js";
import type { Activity, HrZoneProfile, LocalDate, Vendor } from "./types.js";

/**
 * Analytics that reproduce the "Analysis" sheet of the reference workbook. Every function takes an
 * {@link ActivityFilter}; the default is running (Run, TrailRun, VirtualRun), and the athlete can
 * narrow it, e.g. to road running only.
 */
export interface AnalyticsOptions {
  filter?: ActivityFilter;
  /** Inclusive local-date range. */
  from?: LocalDate;
  to?: LocalDate;
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;

function scope(activities: readonly Activity[], options: AnalyticsOptions): Activity[] {
  return filterActivities(activities, options.filter ?? PRESET_FILTERS.running).filter(
    (a) =>
      !a.deleted &&
      (options.from === undefined || a.localDate >= options.from) &&
      (options.to === undefined || a.localDate <= options.to),
  );
}

export interface Kpis {
  count: number;
  distanceM: number;
  elapsedS: number;
  /** Weighted: total elapsed time / total distance. */
  paceSPerKm: number | null;
  avgHr: number | null;
  avgRelativeEffort: number | null;
  elevationGainM: number;
  longestDistanceM: number | null;
}

/** KPI cards: count, distance, time, weighted pace, avg HR, avg effort, elevation, longest. */
export function kpis(activities: readonly Activity[], options: AnalyticsOptions = {}): Kpis {
  const list = scope(activities, options);
  let distanceM = 0;
  let elapsedS = 0;
  let elevationGainM = 0;
  let paceDist = 0;
  let paceTime = 0;
  let longest: number | null = null;
  for (const a of list) {
    distanceM += a.distanceM ?? 0;
    elapsedS += a.elapsedTimeS;
    elevationGainM += a.elevationGainM ?? 0;
    if (a.distanceM !== null && a.distanceM > 0) {
      paceDist += a.distanceM;
      paceTime += a.elapsedTimeS;
      longest = Math.max(longest ?? 0, a.distanceM);
    }
  }
  return {
    count: list.length,
    distanceM,
    elapsedS,
    paceSPerKm: paceDist > 0 ? paceTime / (paceDist / 1000) : null,
    avgHr: mean(list.flatMap((a) => (a.avgHr === null ? [] : [a.avgHr]))),
    avgRelativeEffort: mean(
      list.flatMap((a) => (a.relativeEffort === null ? [] : [a.relativeEffort])),
    ),
    elevationGainM,
    longestDistanceM: longest,
  };
}

export interface MixEntry {
  sportType: string;
  count: number;
  distanceM: number;
  elapsedS: number;
  /** Share of the activity count, 0–1. */
  share: number;
}

/** Activity mix by sport type, most frequent first. Default filter: all activities. */
export function activityMix(
  activities: readonly Activity[],
  options: AnalyticsOptions = {},
): MixEntry[] {
  const list = scope(activities, { ...options, filter: options.filter ?? PRESET_FILTERS.all });
  const map = new Map<string, MixEntry>();
  for (const a of list) {
    const e = map.get(a.sportType) ?? {
      sportType: a.sportType,
      count: 0,
      distanceM: 0,
      elapsedS: 0,
      share: 0,
    };
    e.count += 1;
    e.distanceM += a.distanceM ?? 0;
    e.elapsedS += a.elapsedTimeS;
    map.set(a.sportType, e);
  }
  const total = list.length;
  return [...map.values()]
    .map((e) => ({ ...e, share: total === 0 ? 0 : e.count / total }))
    .sort((a, b) => b.count - a.count || a.sportType.localeCompare(b.sportType));
}

export interface ZoneEntry {
  /** Zone name, or `null` for activities without HR. */
  zone: string | null;
  count: number;
  distanceM: number;
  avgHr: number | null;
  avgRelativeEffort: number | null;
}

/** Intensity by HR zone (each activity classified with the profile valid on its date). */
export function zoneBreakdown(
  activities: readonly Activity[],
  profiles: readonly HrZoneProfile[],
  options: AnalyticsOptions & { zoneSourcePreference?: readonly Vendor[] } = {},
): ZoneEntry[] {
  const groups = new Map<string | null, Activity[]>();
  const order: (string | null)[] = [];
  for (const a of scope(activities, options)) {
    const p = profileForDate(profiles, a.localDate, options.zoneSourcePreference);
    const zone = p ? (classifyHr(a.avgHr, p.zones)?.name ?? null) : null;
    if (!groups.has(zone)) {
      groups.set(zone, []);
      order.push(zone);
    }
    groups.get(zone)?.push(a);
  }
  // Zones in profile order (low → high) using the latest profile; unknown names and `null` last.
  const latest = profileForDate(profiles, "9999-12-31", options.zoneSourcePreference);
  const rank = (z: string | null): number => {
    const i = latest?.zones.findIndex((x) => x.name === z) ?? -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return order
    .sort((a, b) => rank(a) - rank(b))
    .map((zone) => {
      const list = groups.get(zone) ?? [];
      return {
        zone,
        count: list.length,
        distanceM: list.reduce((s, a) => s + (a.distanceM ?? 0), 0),
        avgHr: mean(list.flatMap((a) => (a.avgHr === null ? [] : [a.avgHr]))),
        avgRelativeEffort: mean(
          list.flatMap((a) => (a.relativeEffort === null ? [] : [a.relativeEffort])),
        ),
      };
    });
}

export interface WeekdayEntry {
  day: DayName;
  count: number;
  distanceM: number;
  /** Share of total distance, 0–1. */
  share: number;
}

/** Distribution by day of week, Monday first. */
export function byWeekday(
  activities: readonly Activity[],
  options: AnalyticsOptions = {},
): WeekdayEntry[] {
  const rows = DAY_NAMES.map((day) => ({ day, count: 0, distanceM: 0, share: 0 }));
  for (const a of scope(activities, options)) {
    const r = rows[weekdayIndex(a.localDate)] as WeekdayEntry;
    r.count += 1;
    r.distanceM += a.distanceM ?? 0;
  }
  const total = rows.reduce((s, r) => s + r.distanceM, 0);
  return rows.map((r) => ({ ...r, share: total === 0 ? 0 : r.distanceM / total }));
}
