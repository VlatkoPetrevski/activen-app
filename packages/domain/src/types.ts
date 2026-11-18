/**
 * Vendor-agnostic domain model. In the initial phase the vocabulary follows Garmin: field names and
 * units mirror the Garmin Health/Activity API (e.g. `distanceInMeters`, `durationInSeconds`,
 * `averageHeartRateInBeatsPerMinute`), activity types use Garmin `activityType` values, and other
 * vendors are mapped onto them by their adapters (see catalog/).
 */
import type { ActivityType } from "./activity-types.js";

/** Calendar date in the athlete's local timezone, formatted `YYYY-MM-DD`. */
export type LocalDate = string;

export const VENDORS = [
  "strava",
  "garmin",
  "polar",
  "suunto",
  "coros",
  "wahoo",
  "apple_health",
  "google_health",
  "manual",
] as const;
export type Vendor = (typeof VENDORS)[number];

export interface SourceRef {
  vendor: Vendor;
  /** Identifier of the activity in the vendor's system. */
  externalId: string;
}

/** An executed (actual) activity, normalized from one or more vendor sources. */
export interface Activity {
  id: string;
  athleteId: string;
  /** Primary source the record was taken from. */
  source: SourceRef;
  /** Activity name from the source. */
  activityName: string;
  /** Garmin `activityType` value (e.g. `RUNNING`, `TRAIL_RUNNING`, `TREADMILL_RUNNING`). */
  activityType: ActivityType;
  /** Start date in athlete-local timezone (Garmin `calendarDate`). */
  calendarDate: LocalDate;
  /** Start, Unix seconds UTC (Garmin `startTimeInSeconds`). */
  startTimeInSeconds: number;
  /** Seconds to add for device-local time (Garmin `startTimeOffsetInSeconds`). */
  startTimeOffsetInSeconds: number;
  distanceInMeters: number | null;
  /** Elapsed duration incl. pauses (Garmin `durationInSeconds`). */
  durationInSeconds: number;
  movingDurationInSeconds: number | null;
  totalElevationGainInMeters: number | null;
  /** Garmin Training Load of the activity (EPOC-based exercise load). */
  trainingLoad: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  averagePowerInWatts: number | null;
  activeKilocalories: number | null;
  gearName: string | null;
  isRace: boolean;
  /** Soft-deleted because the source deleted it (SYNC-04). */
  deleted: boolean;
}

export type PlanEntryKind = "workout" | "rest";

/** A planned session. Owned by the application, independent from vendor data (PLAN-01..06). */
export interface PlanEntry {
  id: string;
  athleteId: string;
  calendarDate: LocalDate;
  kind: PlanEntryKind;
  /** Free-text plan description shown in the "Activity Plan" column. */
  description: string;
  plannedActivityType: ActivityType | null;
  plannedDistanceInMeters: number | null;
  plannedDurationInSeconds: number | null;
  notes: string | null;
  /** Ordering when several sessions are planned on the same date (AM/PM). Lower first. */
  sequence: number;
}

/** User decision that overrides automatic plan-to-activity matching (rule 5). */
export interface PlanLinkOverride {
  planEntryId: string;
  /** `null` = the user explicitly unlinked the plan from any activity. */
  activityId: string | null;
}

export interface HrZone {
  name: string;
  /** Inclusive lower bound in bpm; `null` only for the first (open-ended) zone. */
  minBpm: number | null;
  /** Inclusive upper bound in bpm; `null` only for the last (open-ended) zone. */
  maxBpm: number | null;
  /** Hex color used in UI and export (HR-06). */
  color: string;
}

/**
 * An immutable, versioned HR-zone profile (HR-04, HR-05). Profiles are either imported from a
 * vendor (Garmin, Polar, Suunto, …) or entered manually (`source: "manual"`).
 */
export interface HrZoneProfile {
  id: string;
  athleteId: string;
  source: Vendor;
  name: string;
  version: number;
  effectiveFrom: LocalDate;
  zones: HrZone[];
}
