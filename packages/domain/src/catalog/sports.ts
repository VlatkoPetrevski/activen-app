import { isActivityType, type ActivityType } from "../activity-types.js";
import type { CatalogVendor } from "./fields.js";

type Rule = [test: (t: Tokens) => boolean, activityType: ActivityType];

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
  [(t) => t.has("MULTI", "TRIATHLON", "DUATHLON", "TRANSITION"), "MULTI_SPORT"],
  [(t) => t.has("TREADMILL") || (t.has("INDOOR") && t.has("RUN")), "TREADMILL_RUNNING"],
  [(t) => t.has("TRAIL") && t.has("RUN"), "TRAIL_RUNNING"],
  [(t) => t.has("TRACK") && t.has("RUN"), "TRACK_RUNNING"],
  [(t) => t.has("VIRTUAL") && t.has("RUN"), "VIRTUAL_RUN"],
  [(t) => t.has("RUN", "JOG"), "RUNNING"],
  [(t) => (t.has("MOUNTAIN") && t.has("BIK", "CYCL")) || t.has("MTB", "EMTB"), "MOUNTAIN_BIKING"],
  [(t) => t.has("GRAVEL", "CYCLOCROSS"), "GRAVEL_CYCLING"],
  [(t) => t.has("EBIK") || (t.is("E") && t.has("BIK")), "E_BIKE_FITNESS"],
  [(t) => t.has("VIRTUAL") && t.has("CYCL", "BIK", "RIDE"), "VIRTUAL_RIDE"],
  [(t) => t.has("SPIN") || (t.has("INDOOR") && t.has("CYCL", "BIK", "RIDE")), "INDOOR_CYCLING"],
  [(t) => t.has("ROAD") && t.has("CYCL", "BIK", "RIDE"), "ROAD_BIKING"],
  [(t) => t.has("CYCL", "BIK", "RIDE"), "CYCLING"],
  [(t) => t.has("OPEN") && t.has("WATER"), "OPEN_WATER_SWIMMING"],
  [(t) => t.has("SWIM", "POOL"), "LAP_SWIMMING"],
  [(t) => t.has("HIK", "MOUNTAINEER"), "HIKING"],
  [(t) => t.has("WALK"), "WALKING"],
  [(t) => t.has("CROSSFIT", "HIIT"), "HIIT"],
  [(t) => t.has("STRENGTH", "WEIGHT"), "STRENGTH_TRAINING"],
  [(t) => t.has("YOGA"), "YOGA"],
  [(t) => t.has("PILATES"), "PILATES"],
  [(t) => t.has("INDOOR") && t.has("ROW"), "INDOOR_ROWING"],
  [(t) => t.has("ROW"), "ROWING"],
  [(t) => t.has("ELLIPTICAL"), "ELLIPTICAL"],
  [(t) => t.has("STAIR", "FLOOR"), "STAIR_CLIMBING"],
  [(t) => t.has("CROSS", "NORDIC", "XC") && t.has("SKI", "COUNTRY"), "CROSS_COUNTRY_SKIING_WS"],
  [(t) => t.has("SKI", "SNOWBOARD"), "RESORT_SKIING_SNOWBOARDING_WS"],
  [(t) => t.has("CARDIO", "TRAINING", "WORKOUT", "FITNESS", "BOOTCAMP"), "INDOOR_CARDIO"],
];

/**
 * Maps a vendor sport value onto Garmin `activityType` values (the canonical vocabulary).
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
  vendor: CatalogVendor,
  sport: string,
  subSport?: string | null,
): ActivityType {
  // Garmin values are canonical already.
  if (vendor === "garmin" && isActivityType(sport.toUpperCase()))
    return sport.toUpperCase() as ActivityType;
  // The sub-sport is more specific (e.g. FIT "running" + "treadmill"), so it is read together with
  // the main sport. A "generic" sub-sport adds nothing.
  const sub = subSport && !/^generic$/i.test(subSport) ? subSport : "";
  const tokens = new Tokens(`${sport} ${sub}`);
  for (const [test, result] of RULES) if (test(tokens)) return result;
  return "OTHER";
}
