/**
 * Canonical sport vocabulary. Strava `sport_type` values are used as the canonical names; adapters
 * for other vendors map their own types onto these.
 */

export type SportCategory = "run" | "ride" | "swim" | "walk_hike" | "strength" | "other";

const CATEGORY_BY_SPORT: Readonly<Record<string, SportCategory>> = {
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",
  Ride: "ride",
  MountainBikeRide: "ride",
  GravelRide: "ride",
  EBikeRide: "ride",
  EMountainBikeRide: "ride",
  VirtualRide: "ride",
  Velomobile: "ride",
  Swim: "swim",
  Walk: "walk_hike",
  Hike: "walk_hike",
  WeightTraining: "strength",
  Crossfit: "strength",
  Workout: "strength",
  HighIntensityIntervalTraining: "strength",
};

export function sportCategory(sportType: string): SportCategory {
  return CATEGORY_BY_SPORT[sportType] ?? "other";
}

/** "Run" activities in the sense of the plan-matching and summary rules (incl. trail & treadmill). */
export function isRun(sportType: string): boolean {
  return sportCategory(sportType) === "run";
}
