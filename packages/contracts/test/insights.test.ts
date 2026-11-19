import type { Activity } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { activityInsights } from "../src/index.js";

const run = (
  id: string,
  date: string,
  km: number,
  minutes: number,
  extra: Partial<Activity> = {},
): Activity => ({
  id,
  athleteId: "a",
  source: { vendor: "garmin", externalId: id },
  activityName: "Run",
  activityType: "RUNNING",
  calendarDate: date,
  startTimeInSeconds: 0,
  startTimeOffsetInSeconds: 0,
  distanceInMeters: km * 1000,
  durationInSeconds: minutes * 60,
  movingDurationInSeconds: null,
  totalElevationGainInMeters: 50,
  trainingLoad: 80,
  averageHeartRateInBeatsPerMinute: 150,
  maxHeartRateInBeatsPerMinute: null,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
  deleted: false,
  ...extra,
});

// Peers: 10 km at 5:30/km, HR 150, load 80.
const peers = [
  run("p1", "2026-11-02", 10, 55),
  run("p2", "2026-11-06", 10, 55),
  run("p3", "2026-11-10", 10, 55),
];

describe("activityInsights", () => {
  it("compares with the plan and recent history, most relevant first", () => {
    const a = run("a", "2026-11-17", 21, 105, {
      averageHeartRateInBeatsPerMinute: 142,
      trainingLoad: 190,
      totalElevationGainInMeters: 420,
    });
    expect(activityInsights(a, [...peers, a], { plannedDistanceInMeters: 20000 }, 10)).toEqual([
      { code: "plan_on_target" },
      { code: "longest_recent" },
      { code: "pace_faster", secondsPerKm: 30 },
      { code: "lower_hr", bpm: 8 },
      { code: "big_load" },
      { code: "hilly", meters: 420 },
    ]);
    expect(activityInsights(a, peers, { plannedDistanceInMeters: 20000 })).toHaveLength(3);
  });

  it("reports going over or under the plan, slower pace and higher HR", () => {
    const slow = run("s", "2026-11-17", 8, 48, { averageHeartRateInBeatsPerMinute: 160 });
    expect(activityInsights(slow, peers, { plannedDistanceInMeters: 10000 }, 10)).toEqual([
      { code: "plan_under", percent: 20 },
      { code: "pace_slower", secondsPerKm: 30 },
      { code: "higher_hr", bpm: 10 },
    ]);
    expect(
      activityInsights(run("o", "2026-11-17", 12, 66), peers, {
        plannedDistanceInMeters: 10000,
      })[0],
    ).toEqual({
      code: "plan_over",
      percent: 20,
    });
  });

  it("stays quiet without enough comparable history", () => {
    const a = run("a", "2026-11-17", 30, 150);
    expect(activityInsights(a, [peers[0]!], null)).toEqual([]);
    const old = peers.map((p) => ({ ...p, calendarDate: "2026-09-01" }));
    expect(activityInsights(a, old, null)).toEqual([]);
    const ride = {
      ...run("b", "2026-11-17", 60, 120),
      activityType: "CYCLING" as const,
      totalElevationGainInMeters: 900,
    };
    expect(activityInsights(ride, peers, null)).toEqual([{ code: "hilly", meters: 900 }]);
    const strength = {
      ...run("g", "2026-11-17", 0, 45),
      activityType: "STRENGTH_TRAINING" as const,
      distanceInMeters: null,
      totalElevationGainInMeters: null,
    };
    expect(activityInsights(strength, peers, null)).toEqual([]);
  });
});
