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
  /** Garmin display name (English). */
  en: string;
  /** Macedonian display name. */
  mk: string;
}

export const ACTIVITY_TYPE_INFO: Readonly<Record<ActivityType, ActivityTypeInfo>> = Object.freeze({
  RUNNING: { group: "running", en: "Run", mk: "Трчање" },
  TRAIL_RUNNING: { group: "running", en: "Trail Run", mk: "Трејл трчање" },
  TREADMILL_RUNNING: { group: "running", en: "Treadmill", mk: "Тредмил" },
  TRACK_RUNNING: { group: "running", en: "Track Run", mk: "Трчање на патека" },
  VIRTUAL_RUN: { group: "running", en: "Virtual Run", mk: "Виртуелно трчање" },
  CYCLING: { group: "cycling", en: "Bike", mk: "Велосипед" },
  ROAD_BIKING: { group: "cycling", en: "Road Bike", mk: "Друмски велосипед" },
  MOUNTAIN_BIKING: { group: "cycling", en: "MTB", mk: "Планински велосипед" },
  GRAVEL_CYCLING: { group: "cycling", en: "Gravel Bike", mk: "Гравел" },
  E_BIKE_FITNESS: { group: "cycling", en: "eBike", mk: "Е-велосипед" },
  INDOOR_CYCLING: { group: "cycling", en: "Bike Indoor", mk: "Велосипед во затворено" },
  VIRTUAL_RIDE: { group: "cycling", en: "Virtual Ride", mk: "Виртуелно возење" },
  LAP_SWIMMING: { group: "swimming", en: "Pool Swim", mk: "Пливање во базен" },
  OPEN_WATER_SWIMMING: { group: "swimming", en: "Open Water", mk: "Пливање на отворено" },
  WALKING: { group: "walking", en: "Walk", mk: "Пешачење" },
  HIKING: { group: "walking", en: "Hike", mk: "Планинарење" },
  STRENGTH_TRAINING: { group: "gym", en: "Strength", mk: "Тренинг за сила" },
  INDOOR_CARDIO: { group: "gym", en: "Cardio", mk: "Кардио" },
  HIIT: { group: "gym", en: "HIIT", mk: "HIIT" },
  YOGA: { group: "gym", en: "Yoga", mk: "Јога" },
  PILATES: { group: "gym", en: "Pilates", mk: "Пилатес" },
  ROWING: { group: "rowing", en: "Row", mk: "Веслање" },
  INDOOR_ROWING: { group: "rowing", en: "Row Indoor", mk: "Веслање во затворено" },
  ELLIPTICAL: { group: "gym", en: "Elliptical", mk: "Елиптичен тренажер" },
  STAIR_CLIMBING: { group: "gym", en: "Stair Stepper", mk: "Скалила" },
  CROSS_COUNTRY_SKIING_WS: { group: "winter_sports", en: "XC Classic Ski", mk: "Нордиско скијање" },
  RESORT_SKIING_SNOWBOARDING_WS: { group: "winter_sports", en: "Ski", mk: "Скијање" },
  MULTI_SPORT: { group: "multisport", en: "Multisport", mk: "Мултиспорт" },
  OTHER: { group: "other", en: "Other", mk: "Друго" },
});

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
