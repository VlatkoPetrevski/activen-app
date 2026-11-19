import type { ActivityDto, PlanEntryDto } from "@activen/contracts";
import { isActivityType, type ActivityType } from "@activen/domain";
import type { Formatter, MessageKey } from "@activen/i18n";
import type { T } from "../i18n/I18nContext.js";

export function sportLabel(t: T, type: string | null): string {
  if (!type) return t("plan.kind.rest");
  return isActivityType(type) ? t(`activityType.${type}` as MessageKey) : type;
}

/** "12.4 km · 1:04:12 · 5:10 /km" */
export function activitySummary(f: Formatter, a: ActivityDto): string {
  const parts: string[] = [];
  if (a.distanceInMeters) parts.push(f.distance(a.distanceInMeters, 1));
  if (a.durationInSeconds) parts.push(f.duration(a.durationInSeconds));
  if (a.distanceInMeters && a.durationInSeconds && a.distanceInMeters > 500)
    parts.push(f.pace(a.durationInSeconds / (a.distanceInMeters / 1000)));
  return parts.join(" · ");
}

export function plannedSummary(f: Formatter, e: PlanEntryDto): string {
  const parts: string[] = [];
  if (e.plannedDistanceInMeters) parts.push(f.distance(e.plannedDistanceInMeters, 1));
  if (e.plannedDurationInSeconds) parts.push(f.duration(e.plannedDurationInSeconds));
  return parts.join(" · ");
}

export const PLAN_SPORTS: ActivityType[] = [
  "RUNNING",
  "TRAIL_RUNNING",
  "TREADMILL_RUNNING",
  "CYCLING",
  "INDOOR_CYCLING",
  "STRENGTH_TRAINING",
  "LAP_SWIMMING",
  "WALKING",
  "HIKING",
  "YOGA",
];
