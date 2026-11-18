import type { CatalogVendor } from "./fields.js";

/**
 * ActiveN canonical sport vocabulary (vendor-neutral). Names follow the familiar Strava style, but
 * treadmill runs get their own type because every watch vendor records them separately.
 */
export const CANONICAL_SPORTS = [
  "Run",
  "TrailRun",
  "TreadmillRun",
  "TrackRun",
  "VirtualRun",
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "VirtualRide",
  "Swim",
  "OpenWaterSwim",
  "Walk",
  "Hike",
  "WeightTraining",
  "Crossfit",
  "Workout",
  "Yoga",
  "Pilates",
  "Rowing",
  "IndoorRowing",
  "Elliptical",
  "StairStepper",
  "NordicSki",
  "AlpineSki",
  "Multisport",
  "Other",
] as const;
export type CanonicalSport = (typeof CANONICAL_SPORTS)[number];

type Rule = [test: (t: Tokens) => boolean, sport: CanonicalSport];

class Tokens {
  private readonly tokens: string[];
  constructor(raw: string) {
    this.tokens = raw
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean);
  }
  /** Some token equals one of the values exactly. */
  is(...values: string[]): boolean {
    return this.tokens.some((t) => values.includes(t));
  }
  /** Some token starts with one of the prefixes. */
  has(...prefixes: string[]): boolean {
    return this.tokens.some((t) => prefixes.some((p) => t.startsWith(p)));
  }
}

// Order matters: specific variants before their generic sport.
const RULES: readonly Rule[] = [
  [(t) => t.has("MULTI", "TRIATHLON", "DUATHLON", "TRANSITION"), "Multisport"],
  [(t) => t.has("TREADMILL") || (t.has("INDOOR") && t.has("RUN")), "TreadmillRun"],
  [(t) => t.has("TRAIL") && t.has("RUN"), "TrailRun"],
  [(t) => t.has("TRACK") && t.has("RUN"), "TrackRun"],
  [(t) => t.has("VIRTUAL") && t.has("RUN"), "VirtualRun"],
  [(t) => t.has("RUN", "JOG"), "Run"],
  [(t) => (t.has("MOUNTAIN") && t.has("BIK", "CYCL")) || t.has("MTB", "EMTB"), "MountainBikeRide"],
  [(t) => t.has("GRAVEL", "CYCLOCROSS"), "GravelRide"],
  [(t) => t.has("EBIK") || (t.is("E") && t.has("BIK")), "EBikeRide"],
  [
    (t) => t.has("SPIN") || (t.has("INDOOR", "VIRTUAL") && t.has("CYCL", "BIK", "RIDE")),
    "VirtualRide",
  ],
  [(t) => t.has("CYCL", "BIK", "RIDE", "ROAD"), "Ride"],
  [(t) => t.has("OPEN") && t.has("WATER"), "OpenWaterSwim"],
  [(t) => t.has("SWIM", "POOL"), "Swim"],
  [(t) => t.has("HIK", "MOUNTAINEER"), "Hike"],
  [(t) => t.has("WALK"), "Walk"],
  [(t) => t.has("CROSSFIT"), "Crossfit"],
  [(t) => t.has("STRENGTH", "WEIGHT"), "WeightTraining"],
  [(t) => t.has("YOGA"), "Yoga"],
  [(t) => t.has("PILATES"), "Pilates"],
  [(t) => t.has("INDOOR") && t.has("ROW"), "IndoorRowing"],
  [(t) => t.has("ROW"), "Rowing"],
  [(t) => t.has("ELLIPTICAL"), "Elliptical"],
  [(t) => t.has("STAIR", "FLOOR"), "StairStepper"],
  [(t) => t.has("CROSS", "NORDIC", "XC") && t.has("SKI", "COUNTRY"), "NordicSki"],
  [(t) => t.has("SKI", "SNOWBOARD"), "AlpineSki"],
  [(t) => t.has("HIIT", "CARDIO", "TRAINING", "WORKOUT", "FITNESS", "BOOTCAMP"), "Workout"],
];

/**
 * Maps a vendor sport value onto the canonical vocabulary.
 *
 * - Garmin: `activityType` (e.g. `TRAIL_RUNNING`, `TREADMILL_RUNNING`, `LAP_SWIMMING`).
 * - Polar: `sport` plus `detailed_sport_info` (the detailed value wins when present).
 * - Suunto / COROS: FIT `sport` plus `sub_sport` (e.g. `running` + `trail`,
 *   `fitness_equipment` + `treadmill`).
 *
 * Matching is token-based and order-sensitive, so new vendor values usually resolve without code
 * changes; unknown values map to `Other` and should be logged by the adapter.
 */
export function normalizeVendorSport(
  _vendor: CatalogVendor,
  sport: string,
  subSport?: string | null,
): CanonicalSport {
  // The sub-sport is more specific (e.g. FIT "running" + "treadmill"), so it is read together with
  // the main sport. A "generic" sub-sport adds nothing.
  const sub = subSport && !/^generic$/i.test(subSport) ? subSport : "";
  const tokens = new Tokens(`${sport} ${sub}`);
  for (const [test, result] of RULES) if (test(tokens)) return result;
  return "Other";
}
