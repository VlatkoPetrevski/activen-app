import { DAY_NAMES, weekdayIndex, type DayName } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { filterActivities, PRESET_FILTERS, type ActivityFilter } from "./sport.js";
import type { Activity, HrZoneProfile, LocalDate, Vendor } from "./types.js";

/**
 * Core analytics (KPIs, activity mix, HR-zone breakdown, weekday distribution). Every function takes
 * an {@link ActivityFilter}; the default is running (all Garmin running types), and the athlete can
 * narrow it, e.g. to road running only (`RUNNING`).
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
      (options.from === undefined || a.calendarDate >= options.from) &&
      (options.to === undefined || a.calendarDate <= options.to),
  );
}

export interface Kpis {
  count: number;
  distanceInMeters: number;
  durationInSeconds: number;
  /** Weighted: total elapsed time / total distance. */
  paceInSecondsPerKilometer: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  averageTrainingLoad: number | null;
  totalElevationGainInMeters: number;
  longestDistanceInMeters: number | null;
}

/** KPI cards: count, distance, time, weighted pace, avg HR, avg effort, elevation, longest. */
export function kpis(activities: readonly Activity[], options: AnalyticsOptions = {}): Kpis {
  const list = scope(activities, options);
  let distanceInMeters = 0;
  let durationInSeconds = 0;
  let totalElevationGainInMeters = 0;
  let paceDist = 0;
  let paceTime = 0;
  let longest: number | null = null;
  for (const a of list) {
    distanceInMeters += a.distanceInMeters ?? 0;
    durationInSeconds += a.durationInSeconds;
    totalElevationGainInMeters += a.totalElevationGainInMeters ?? 0;
    if (a.distanceInMeters !== null && a.distanceInMeters > 0) {
      paceDist += a.distanceInMeters;
      paceTime += a.durationInSeconds;
      longest = Math.max(longest ?? 0, a.distanceInMeters);
    }
  }
  return {
    count: list.length,
    distanceInMeters,
    durationInSeconds,
    paceInSecondsPerKilometer: paceDist > 0 ? paceTime / (paceDist / 1000) : null,
    averageHeartRateInBeatsPerMinute: mean(
      list.flatMap((a) =>
        a.averageHeartRateInBeatsPerMinute === null ? [] : [a.averageHeartRateInBeatsPerMinute],
      ),
    ),
    averageTrainingLoad: mean(
      list.flatMap((a) => (a.trainingLoad === null ? [] : [a.trainingLoad])),
    ),
    totalElevationGainInMeters,
    longestDistanceInMeters: longest,
  };
}

export interface MixEntry {
  activityType: string;
  count: number;
  distanceInMeters: number;
  durationInSeconds: number;
  /** Share of the activity count, 0–1. */
  share: number;
}

/** Activity mix by activity type, most frequent first. Default filter: all activities. */
export function activityMix(
  activities: readonly Activity[],
  options: AnalyticsOptions = {},
): MixEntry[] {
  const list = scope(activities, { ...options, filter: options.filter ?? PRESET_FILTERS.all });
  const map = new Map<string, MixEntry>();
  for (const a of list) {
    const e = map.get(a.activityType) ?? {
      activityType: a.activityType,
      count: 0,
      distanceInMeters: 0,
      durationInSeconds: 0,
      share: 0,
    };
    e.count += 1;
    e.distanceInMeters += a.distanceInMeters ?? 0;
    e.durationInSeconds += a.durationInSeconds;
    map.set(a.activityType, e);
  }
  const total = list.length;
  return [...map.values()]
    .map((e) => ({ ...e, share: total === 0 ? 0 : e.count / total }))
    .sort((a, b) => b.count - a.count || a.activityType.localeCompare(b.activityType));
}

export interface ZoneEntry {
  /** Zone name, or `null` for activities without HR. */
  zone: string | null;
  count: number;
  distanceInMeters: number;
  averageHeartRateInBeatsPerMinute: number | null;
  averageTrainingLoad: number | null;
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
    const p = profileForDate(profiles, a.calendarDate, options.zoneSourcePreference);
    const zone = p ? (classifyHr(a.averageHeartRateInBeatsPerMinute, p.zones)?.name ?? null) : null;
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
        distanceInMeters: list.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0),
        averageHeartRateInBeatsPerMinute: mean(
          list.flatMap((a) =>
            a.averageHeartRateInBeatsPerMinute === null ? [] : [a.averageHeartRateInBeatsPerMinute],
          ),
        ),
        averageTrainingLoad: mean(
          list.flatMap((a) => (a.trainingLoad === null ? [] : [a.trainingLoad])),
        ),
      };
    });
}

export interface WeekdayEntry {
  day: DayName;
  count: number;
  distanceInMeters: number;
  /** Share of total distance, 0–1. */
  share: number;
}

/** Distribution by day of week, Monday first. */
export function byWeekday(
  activities: readonly Activity[],
  options: AnalyticsOptions = {},
): WeekdayEntry[] {
  const rows = DAY_NAMES.map((day) => ({ day, count: 0, distanceInMeters: 0, share: 0 }));
  for (const a of scope(activities, options)) {
    const r = rows[weekdayIndex(a.calendarDate)] as WeekdayEntry;
    r.count += 1;
    r.distanceInMeters += a.distanceInMeters ?? 0;
  }
  const total = rows.reduce((s, r) => s + r.distanceInMeters, 0);
  return rows.map((r) => ({ ...r, share: total === 0 ? 0 : r.distanceInMeters / total }));
}
