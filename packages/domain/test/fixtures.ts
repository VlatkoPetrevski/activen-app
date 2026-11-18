import type { Activity, HrZone, HrZoneProfile, PlanEntry } from "../src/types.js";

/**
 * A manually entered zone profile (the athlete's own zones from the reference workbook). Used as a
 * realistic manual profile in tests; Garmin defaults live in src/hr-zones.ts.
 */
export const MANUAL_ZONES: readonly HrZone[] = Object.freeze([
  { name: "Easy", minBpm: null, maxBpm: 139, color: "#D9D9D9" },
  { name: "AeT", minBpm: 140, maxBpm: 150, color: "#9DC3E6" },
  { name: "Tempo", minBpm: 151, maxBpm: 165, color: "#A9D18E" },
  { name: "AnT", minBpm: 166, maxBpm: 171, color: "#F4B183" },
  { name: "VO2max", minBpm: 172, maxBpm: null, color: "#F4CCCC" },
]);

let seq = 0;

/** ISO instant → Unix seconds (Garmin `startTimeInSeconds`). */
export const t = (iso: string): number => Date.parse(iso) / 1000;

export function activity(overrides: Partial<Activity> & { calendarDate: string }): Activity {
  seq += 1;
  return {
    id: `a${seq}`,
    athleteId: "ath1",
    source: { vendor: "strava", externalId: `s${seq}` },
    activityName: `Activity ${seq}`,
    activityType: "RUNNING",
    startTimeInSeconds: t(`${overrides.calendarDate}T07:00:00Z`),
    startTimeOffsetInSeconds: 3_600,
    distanceInMeters: 10_000,
    durationInSeconds: 3_000,
    movingDurationInSeconds: 2_900,
    totalElevationGainInMeters: 50,
    trainingLoad: 40,
    averageHeartRateInBeatsPerMinute: 145,
    maxHeartRateInBeatsPerMinute: 165,
    averagePowerInWatts: null,
    activeKilocalories: 600,
    gearName: "Shoe",
    isRace: false,
    deleted: false,
    ...overrides,
  };
}

export function plan(overrides: Partial<PlanEntry> & { calendarDate: string }): PlanEntry {
  seq += 1;
  return {
    id: `p${seq}`,
    athleteId: "ath1",
    kind: "workout",
    description: `Plan ${seq}`,
    plannedActivityType: null,
    plannedDistanceInMeters: null,
    plannedDurationInSeconds: null,
    notes: null,
    sequence: 0,
    ...overrides,
  };
}

export function defaultProfile(overrides: Partial<HrZoneProfile> = {}): HrZoneProfile {
  return {
    id: "hp1",
    athleteId: "ath1",
    source: "manual",
    name: "Default",
    version: 1,
    effectiveFrom: "2023-01-01",
    zones: MANUAL_ZONES.map((z) => ({ ...z })),
    ...overrides,
  };
}
