import type { ActivityDto, PlanEntryDto } from "@activen/contracts";
import { activityGroup, isActivityType, type ActivityType } from "@activen/domain";
import type { Formatter, MessageKey } from "@activen/i18n";
import type { T } from "../i18n/I18nContext.js";

export function sportLabel(t: T, type: string | null): string {
  if (!type) return t("plan.kind.rest");
  return isActivityType(type) ? t(`activityType.${type}` as MessageKey) : type;
}

/** Foot sports are read in pace (min/km), everything else in speed. */
export function readsPace(type: string): boolean {
  const group = isActivityType(type) ? activityGroup(type) : "other";
  return group === "running" || group === "walking";
}

/** "16/70 km": done against planned distance, or just the done distance without a plan. */
export function distanceOfPlan(f: Formatter, done: number, planned: number): string {
  return planned > 0
    ? `${f.number(f.distanceValue(done), 0)}/${f.distance(planned, 0)}`
    : f.distance(done, 1);
}

/** Pace for foot sports, speed for wheels and water; null when it does not apply. */
export function paceOrSpeed(
  f: Formatter,
  a: Pick<ActivityDto, "activityType" | "distanceInMeters" | "durationInSeconds">,
): { kind: "pace" | "speed"; text: string } | null {
  if (!a.distanceInMeters || !a.durationInSeconds || a.distanceInMeters <= 500) return null;
  if (readsPace(a.activityType))
    return { kind: "pace", text: f.pace(a.durationInSeconds / (a.distanceInMeters / 1000)) };
  const group = isActivityType(a.activityType) ? activityGroup(a.activityType) : "other";
  if (group === "cycling" || group === "swimming" || group === "rowing")
    return { kind: "speed", text: f.speed(a.distanceInMeters / a.durationInSeconds) };
  return null;
}

/** "12.4 km · 1:04:12 · 5:10 /km" (or km/h on the bike) */
export function activitySummary(f: Formatter, a: ActivityDto): string {
  const parts: string[] = [];
  if (a.distanceInMeters) parts.push(f.distance(a.distanceInMeters, 1));
  if (a.durationInSeconds) parts.push(f.duration(a.durationInSeconds));
  const ps = paceOrSpeed(f, a);
  if (ps) parts.push(ps.text);
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
