/**
 * Canonical sport vocabulary. Strava `sport_type` values are used as the canonical names; adapters
 * for other vendors map their own types onto these. Lookups ignore spaces and case, so export-style
 * names such as "Weight Training" resolve to the API-style "WeightTraining".
 */

export type SportCategory = "run" | "ride" | "swim" | "walk_hike" | "strength" | "row" | "other";

const CATEGORY_BY_SPORT: Readonly<Record<string, SportCategory>> = {
  run: "run",
  trailrun: "run",
  treadmillrun: "run",
  trackrun: "run",
  virtualrun: "run",
  ride: "ride",
  mountainbikeride: "ride",
  gravelride: "ride",
  ebikeride: "ride",
  emountainbikeride: "ride",
  virtualride: "ride",
  velomobile: "ride",
  swim: "swim",
  openwaterswim: "swim",
  walk: "walk_hike",
  hike: "walk_hike",
  weighttraining: "strength",
  crossfit: "strength",
  workout: "strength",
  highintensityintervaltraining: "strength",
  rowing: "row",
  indoorrowing: "row",
  virtualrow: "row",
};

/** Normalizes a sport type for comparisons ("Weight Training" → "weighttraining"). */
export function sportKey(sportType: string): string {
  return sportType.replace(/[\s_-]+/g, "").toLowerCase();
}

export function sportCategory(sportType: string): SportCategory {
  return CATEGORY_BY_SPORT[sportKey(sportType)] ?? "other";
}

/** "Run" in the sense of the plan-matching and summary rules: road, trail, track, treadmill, virtual. */
export function isRun(sportType: string): boolean {
  return sportCategory(sportType) === "run";
}

/**
 * User-selectable activity filter, applied to reports, summaries and analytics.
 * All present criteria must match. Sport types are compared with {@link sportKey}.
 */
export interface ActivityFilter {
  /** Keep only these categories (e.g. `["run"]` for "running only"). */
  categories?: readonly SportCategory[];
  /** Keep only these sport types (e.g. `["Run"]` = road running without trail/treadmill). */
  sportTypes?: readonly string[];
  /** Drop these sport types (e.g. `["VirtualRun"]` = without treadmill). */
  excludeSportTypes?: readonly string[];
}

export function matchesFilter(sportType: string, filter: ActivityFilter | undefined): boolean {
  if (!filter) return true;
  const key = sportKey(sportType);
  if (filter.categories && !filter.categories.includes(sportCategory(sportType))) return false;
  if (filter.sportTypes && !filter.sportTypes.some((t) => sportKey(t) === key)) return false;
  if (filter.excludeSportTypes?.some((t) => sportKey(t) === key)) return false;
  return true;
}

export function filterActivities<T extends { sportType: string }>(
  activities: readonly T[],
  filter: ActivityFilter | undefined,
): T[] {
  return activities.filter((a) => matchesFilter(a.sportType, filter));
}

/** Ready-made filters offered in the UI. */
export const PRESET_FILTERS = {
  all: {},
  running: { categories: ["run"] },
  roadRunning: { sportTypes: ["Run"] },
  runningWithoutTreadmill: {
    categories: ["run"],
    excludeSportTypes: ["TreadmillRun", "VirtualRun"],
  },
  runningWithoutTrail: { categories: ["run"], excludeSportTypes: ["TrailRun"] },
} as const satisfies Record<string, ActivityFilter>;
