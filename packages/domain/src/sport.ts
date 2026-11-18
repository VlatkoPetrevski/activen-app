import { ACTIVITY_TYPE_INFO, isActivityType, type ActivityGroup } from "./activity-types.js";

/**
 * Activity grouping and user filters, using Garmin `activityType` values (see activity-types.ts).
 * Lookups are tolerant of case, spaces and hyphens ("Trail Running" → `TRAIL_RUNNING`).
 */

/** Normalizes a type for comparisons ("trail running" → "TRAIL_RUNNING"). */
export function activityTypeKey(activityType: string): string {
  return activityType
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function activityGroup(activityType: string): ActivityGroup {
  const key = activityTypeKey(activityType);
  return isActivityType(key) ? ACTIVITY_TYPE_INFO[key].group : "other";
}

/** Running in the sense of plan matching and summaries: road, trail, track, treadmill, virtual. */
export function isRunning(activityType: string): boolean {
  return activityGroup(activityType) === "running";
}

/**
 * User-selectable activity filter, applied to reports, summaries and analytics.
 * All present criteria must match.
 */
export interface ActivityFilter {
  /** Keep only these groups (e.g. `["running"]`). */
  groups?: readonly ActivityGroup[];
  /** Keep only these activity types (e.g. `["RUNNING"]` = road running without trail/treadmill). */
  activityTypes?: readonly string[];
  /** Drop these activity types (e.g. `["TREADMILL_RUNNING"]`). */
  excludeActivityTypes?: readonly string[];
}

export function matchesFilter(activityType: string, filter: ActivityFilter | undefined): boolean {
  if (!filter) return true;
  const key = activityTypeKey(activityType);
  if (filter.groups && !filter.groups.includes(activityGroup(activityType))) return false;
  if (filter.activityTypes && !filter.activityTypes.some((t) => activityTypeKey(t) === key))
    return false;
  if (filter.excludeActivityTypes?.some((t) => activityTypeKey(t) === key)) return false;
  return true;
}

export function filterActivities<T extends { activityType: string }>(
  activities: readonly T[],
  filter: ActivityFilter | undefined,
): T[] {
  return activities.filter((a) => matchesFilter(a.activityType, filter));
}

/** Ready-made filters offered in the UI. */
export const PRESET_FILTERS = {
  all: {},
  running: { groups: ["running"] },
  roadRunning: { activityTypes: ["RUNNING"] },
  runningWithoutTreadmill: {
    groups: ["running"],
    excludeActivityTypes: ["TREADMILL_RUNNING", "VIRTUAL_RUN"],
  },
  runningWithoutTrail: { groups: ["running"], excludeActivityTypes: ["TRAIL_RUNNING"] },
} as const satisfies Record<string, ActivityFilter>;
