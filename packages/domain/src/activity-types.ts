/**
 * ActiveN activity types follow Garmin's `activityType` vocabulary (initial phase: Garmin is the
 * reference model). Other vendors are normalized onto these values.
 *
 * The enum values must be verified against Garmin Activity API "Appendix A – Activity Types" once
 * partner access is granted (docs/open-questions.md, Q17).
 */
export const ACTIVITY_TYPES = [
  "RUNNING",
  "TRAIL_RUNNING",
  "TREADMILL_RUNNING",
  "TRACK_RUNNING",
  "VIRTUAL_RUN",
  "CYCLING",
  "ROAD_BIKING",
  "MOUNTAIN_BIKING",
  "GRAVEL_CYCLING",
  "E_BIKE_FITNESS",
  "INDOOR_CYCLING",
  "VIRTUAL_RIDE",
  "LAP_SWIMMING",
  "OPEN_WATER_SWIMMING",
  "WALKING",
  "HIKING",
  "STRENGTH_TRAINING",
  "INDOOR_CARDIO",
  "HIIT",
  "YOGA",
  "PILATES",
  "ROWING",
  "INDOOR_ROWING",
  "ELLIPTICAL",
  "STAIR_CLIMBING",
  "CROSS_COUNTRY_SKIING_WS",
  "RESORT_SKIING_SNOWBOARDING_WS",
  "MULTI_SPORT",
  "OTHER",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Parent groups, as Garmin groups activities on the watch (Running, Cycling, Swimming, Gym …).
 */
export type ActivityGroup =
  | "running"
  | "cycling"
  | "swimming"
  | "walking"
  | "gym"
  | "rowing"
  | "winter_sports"
  | "multisport"
  | "other";

interface ActivityTypeInfo {
  group: ActivityGroup;
}

export const ACTIVITY_TYPE_INFO: Readonly<Record<ActivityType, ActivityTypeInfo>> = Object.freeze({
  RUNNING: { group: "running" },
  TRAIL_RUNNING: { group: "running" },
  TREADMILL_RUNNING: { group: "running" },
  TRACK_RUNNING: { group: "running" },
  VIRTUAL_RUN: { group: "running" },
  CYCLING: { group: "cycling" },
  ROAD_BIKING: { group: "cycling" },
  MOUNTAIN_BIKING: { group: "cycling" },
  GRAVEL_CYCLING: { group: "cycling" },
  E_BIKE_FITNESS: { group: "cycling" },
  INDOOR_CYCLING: { group: "cycling" },
  VIRTUAL_RIDE: { group: "cycling" },
  LAP_SWIMMING: { group: "swimming" },
  OPEN_WATER_SWIMMING: { group: "swimming" },
  WALKING: { group: "walking" },
  HIKING: { group: "walking" },
  STRENGTH_TRAINING: { group: "gym" },
  INDOOR_CARDIO: { group: "gym" },
  HIIT: { group: "gym" },
  YOGA: { group: "gym" },
  PILATES: { group: "gym" },
  ROWING: { group: "rowing" },
  INDOOR_ROWING: { group: "rowing" },
  ELLIPTICAL: { group: "gym" },
  STAIR_CLIMBING: { group: "gym" },
  CROSS_COUNTRY_SKIING_WS: { group: "winter_sports" },
  RESORT_SKIING_SNOWBOARDING_WS: { group: "winter_sports" },
  MULTI_SPORT: { group: "multisport" },
  OTHER: { group: "other" },
});

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
