import type { Activity } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { importOutcome } from "../src/imports.js";

const base: Activity = {
  id: "a",
  athleteId: "u",
  source: { vendor: "polar", externalId: "p1" },
  activityName: "Run",
  activityType: "RUNNING",
  calendarDate: "2026-11-18",
  startTimeInSeconds: 1_000_000,
  startTimeOffsetInSeconds: 3600,
  distanceInMeters: 10_000,
  durationInSeconds: 3000,
  movingDurationInSeconds: null,
  totalElevationGainInMeters: null,
  trainingLoad: null,
  averageHeartRateInBeatsPerMinute: null,
  maxHeartRateInBeatsPerMinute: null,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
  deleted: false,
};
const parsed = {
  activityType: "RUNNING" as const,
  startTimeInSeconds: 1_000_120,
  durationInSeconds: 3100,
};

describe("importOutcome", () => {
  it("is new without a matching workout", () => {
    expect(importOutcome(parsed, [])).toEqual({ kind: "new" });
    // Too far apart, another sport, much longer, or deleted: not the same workout.
    expect(importOutcome(parsed, [{ ...base, startTimeInSeconds: 1_000_000 - 600 }]).kind).toBe(
      "new",
    );
    expect(importOutcome(parsed, [{ ...base, activityType: "CYCLING" }]).kind).toBe("new");
    expect(importOutcome(parsed, [{ ...base, durationInSeconds: 5000 }]).kind).toBe("new");
    expect(importOutcome(parsed, [{ ...base, deleted: true }]).kind).toBe("new");
  });

  it("merges with an app and refuses a second file of the same workout", () => {
    expect(importOutcome(parsed, [base])).toEqual({ kind: "merged", activity: base });
    const file = { ...base, id: "f", source: { vendor: "manual" as const, externalId: "x" } };
    // A file wins over an app match: the workout was already uploaded.
    expect(importOutcome(parsed, [base, file])).toEqual({ kind: "duplicate", activity: file });
    // Trail and road runs are the same sport group.
    expect(importOutcome({ ...parsed, activityType: "TRAIL_RUNNING" }, [base]).kind).toBe("merged");
  });
});
