import type { ActivityType } from "@activen/domain";

/**
 * FIT `sport` / `sub_sport` (as decoded by the FIT SDK, camelCase strings) to the Garmin
 * activity type. Unknown combinations fall back to the sport's general type, then OTHER.
 */
const BY_SUB_SPORT: Record<string, Record<string, ActivityType>> = {
  running: {
    trail: "TRAIL_RUNNING",
    treadmill: "TREADMILL_RUNNING",
    track: "TRACK_RUNNING",
    virtualActivity: "VIRTUAL_RUN",
    indoorRunning: "TREADMILL_RUNNING",
  },
  cycling: {
    road: "ROAD_BIKING",
    mountain: "MOUNTAIN_BIKING",
    downhill: "MOUNTAIN_BIKING",
    gravelCycling: "GRAVEL_CYCLING",
    cyclocross: "GRAVEL_CYCLING",
    indoorCycling: "INDOOR_CYCLING",
    spin: "INDOOR_CYCLING",
    virtualActivity: "VIRTUAL_RIDE",
    eBikeFitness: "E_BIKE_FITNESS",
    eBikeMountain: "E_BIKE_FITNESS",
  },
  swimming: { lapSwimming: "LAP_SWIMMING", openWater: "OPEN_WATER_SWIMMING" },
  training: {
    strengthTraining: "STRENGTH_TRAINING",
    cardioTraining: "INDOOR_CARDIO",
    yoga: "YOGA",
    pilates: "PILATES",
    hiit: "HIIT",
  },
  fitnessEquipment: {
    elliptical: "ELLIPTICAL",
    stairClimbing: "STAIR_CLIMBING",
    indoorRowing: "INDOOR_ROWING",
    treadmill: "TREADMILL_RUNNING",
    indoorCycling: "INDOOR_CYCLING",
  },
};

const BY_SPORT: Record<string, ActivityType> = {
  running: "RUNNING",
  cycling: "CYCLING",
  eBiking: "E_BIKE_FITNESS",
  swimming: "LAP_SWIMMING",
  walking: "WALKING",
  hiking: "HIKING",
  training: "INDOOR_CARDIO",
  hiit: "HIIT",
  rowing: "ROWING",
  crossCountrySkiing: "CROSS_COUNTRY_SKIING_WS",
  alpineSkiing: "RESORT_SKIING_SNOWBOARDING_WS",
  snowboarding: "RESORT_SKIING_SNOWBOARDING_WS",
  multisport: "MULTI_SPORT",
  transition: "MULTI_SPORT",
};

export function fitActivityType(sport: unknown, subSport: unknown): ActivityType {
  const s = typeof sport === "string" ? sport : "";
  const sub = typeof subSport === "string" ? subSport : "";
  return BY_SUB_SPORT[s]?.[sub] ?? BY_SPORT[s] ?? "OTHER";
}

/**
 * Free-text sport names from GPX `<type>` and TCX `Sport` ("running", "Biking", "trail_run",
 * Strava's "Run"/"Ride", …). Matching is by keyword, most specific first.
 */
const KEYWORDS: [RegExp, ActivityType][] = [
  [/trail/i, "TRAIL_RUNNING"],
  [/treadmill/i, "TREADMILL_RUNNING"],
  [/virtual[\s_-]?run/i, "VIRTUAL_RUN"],
  [/virtual[\s_-]?ride/i, "VIRTUAL_RIDE"],
  [/mountain|mtb/i, "MOUNTAIN_BIKING"],
  [/gravel/i, "GRAVEL_CYCLING"],
  [/e-?bike/i, "E_BIKE_FITNESS"],
  [/indoor.*(cycl|bik)|spin/i, "INDOOR_CYCLING"],
  [/open[\s_-]?water/i, "OPEN_WATER_SWIMMING"],
  [/swim/i, "LAP_SWIMMING"],
  [/hik/i, "HIKING"],
  [/walk/i, "WALKING"],
  [/run/i, "RUNNING"],
  [/road/i, "ROAD_BIKING"],
  [/bik|cycl|ride/i, "CYCLING"],
  [/row/i, "ROWING"],
  [/ski/i, "CROSS_COUNTRY_SKIING_WS"],
  [/strength|weight/i, "STRENGTH_TRAINING"],
  [/yoga/i, "YOGA"],
];

/** Strava's numeric GPX activity codes (Strava export `<type>9</type>` = run, `1` = ride). */
const STRAVA_CODES: Record<string, ActivityType> = {
  "1": "CYCLING",
  "9": "RUNNING",
  "10": "WALKING",
  "4": "HIKING",
};

export function textActivityType(text: string | null | undefined): ActivityType | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (STRAVA_CODES[t]) return STRAVA_CODES[t];
  for (const [re, type] of KEYWORDS) if (re.test(t)) return type;
  return "OTHER";
}
