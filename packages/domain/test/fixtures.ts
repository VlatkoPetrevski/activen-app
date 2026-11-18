import { DEFAULT_HR_ZONES } from "../src/hr-zones.js";
import type { Activity, HrZoneProfile, PlanEntry } from "../src/types.js";

let seq = 0;

export function activity(overrides: Partial<Activity> & { localDate: string }): Activity {
  seq += 1;
  return {
    id: `a${seq}`,
    athleteId: "ath1",
    source: { vendor: "strava", externalId: `s${seq}` },
    name: `Activity ${seq}`,
    sportType: "Run",
    startTime: `${overrides.localDate}T07:00:00Z`,
    distanceM: 10_000,
    elapsedTimeS: 3_000,
    movingTimeS: 2_900,
    elevationGainM: 50,
    relativeEffort: 40,
    avgHr: 145,
    maxHr: 165,
    avgWatts: null,
    calories: 600,
    gearName: "Shoe",
    isRace: false,
    deleted: false,
    ...overrides,
  };
}

export function plan(overrides: Partial<PlanEntry> & { date: string }): PlanEntry {
  seq += 1;
  return {
    id: `p${seq}`,
    athleteId: "ath1",
    kind: "workout",
    description: `Plan ${seq}`,
    plannedSportType: null,
    plannedDistanceM: null,
    plannedDurationS: null,
    notes: null,
    sequence: 0,
    ...overrides,
  };
}

export function defaultProfile(overrides: Partial<HrZoneProfile> = {}): HrZoneProfile {
  return {
    id: "hp1",
    athleteId: "ath1",
    name: "Default",
    version: 1,
    effectiveFrom: "2023-01-01",
    zones: DEFAULT_HR_ZONES.map((z) => ({ ...z })),
    ...overrides,
  };
}
