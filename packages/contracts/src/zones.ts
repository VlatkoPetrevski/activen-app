import {
  estimatedMaxHeartRate,
  GARMIN_HR_ZONE_TEMPLATE,
  resolveHrZones,
  zonesFromLowerBounds,
  type AthleteSettings,
  type HrZone,
  type HrZoneProfile,
  type LocalDate,
} from "@activen/domain";
import type { HrZonesDto } from "./responses.js";

/**
 * The five zones by physiology, shown with every zone source. Names follow the usual
 * threshold model: Z2 ends at the aerobic threshold (AeT / VT1, ~LT1), Z4 sits around the
 * anaerobic threshold (AnT / VT2, ~LT2), Z5 is VO2max work.
 */
export const HR_ZONE_KEYS = ["recovery", "aerobic", "tempo", "threshold", "vo2max"] as const;
export type HrZoneKey = (typeof HR_ZONE_KEYS)[number];

/** Colors of zones 1–5 (gray, blue, green, orange, red, as on Garmin watches). */
export const HR_ZONE_COLORS = GARMIN_HR_ZONE_TEMPLATE.map((z) => z.color);

/** % of max HR at the start of zones 2–5 (Garmin default: 60, 70, 80, 90 %). */
export const DEFAULT_ZONE_PERCENTS = [0.6, 0.7, 0.8, 0.9] as const;

/** Lower bounds of zones 2–5 from a max heart rate, rounded to whole beats. */
export const lowerBoundsFromMax = (maxHeartRate: number): number[] =>
  DEFAULT_ZONE_PERCENTS.map((p) => Math.round(p * maxHeartRate));

/** The athlete's own five zones from the lower bounds of zones 2–5 (zone 1 open below). */
export function manualZones(lowerBounds: readonly number[]): HrZone[] {
  const first = Math.max(30, (lowerBounds[0] ?? 100) - 20);
  return zonesFromLowerBounds([first, ...lowerBounds], { colors: HR_ZONE_COLORS });
}

/** Full years between two dates (for 220 − age). */
function ageOn(birthDate: LocalDate, date: LocalDate): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** What the profile shows: the zones in use on `date`, their origin, and the max HR used. */
export function hrZonesView(
  profiles: readonly HrZoneProfile[],
  date: LocalDate,
  settings: AthleteSettings,
): HrZonesDto {
  const resolved = resolveHrZones(profiles, date, settings);
  const maxHeartRate =
    settings.maxHeartRate ??
    (settings.birthDate ? estimatedMaxHeartRate(ageOn(settings.birthDate, date)) : null);
  if (!resolved)
    return { zones: [], origin: "garmin_default", source: null, maxHeartRate, fellBack: false };
  return {
    zones: resolved.zones,
    origin: resolved.origin,
    source: resolved.profile?.source ?? null,
    maxHeartRate,
    fellBack: resolved.fellBack,
  };
}
