/**
 * Vendor-agnostic domain model.
 *
 * Every data source (Strava, Garmin, Polar, Suunto, COROS, ...) is mapped by an adapter into these
 * types. Nothing in the domain layer knows which vendor an activity came from beyond `source`.
 */

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
  /** Exact activity name from the source (spec field N). */
  name: string;
  /** Sport type using Strava's sport_type vocabulary as canonical (e.g. "Run", "TrailRun", "Ride"). */
  sportType: string;
  /** Start date in athlete-local timezone (spec field A). */
  localDate: LocalDate;
  /** Start instant, ISO-8601 UTC. */
  startTime: string;
  distanceM: number | null;
  elapsedTimeS: number;
  movingTimeS: number | null;
  elevationGainM: number | null;
  relativeEffort: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  calories: number | null;
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
  date: LocalDate;
  kind: PlanEntryKind;
  /** Free-text plan description shown in the "Activity Plan" column. */
  description: string;
  plannedSportType: string | null;
  plannedDistanceM: number | null;
  plannedDurationS: number | null;
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
