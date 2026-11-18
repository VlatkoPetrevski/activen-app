import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPE_INFO, ACTIVITY_TYPES, isActivityType } from "../src/activity-types.js";
import {
  ACUTE_LOAD_WINDOW_DAYS,
  hrvStatus,
  LOAD_FOCUS_CATEGORIES,
  LOAD_FOCUS_FEEDBACK,
  TRAINING_READINESS_FACTORS,
  TRAINING_STATUSES,
  trainingEffectBenefit,
  trainingReadinessLevel,
} from "../src/garmin-metrics.js";
import {
  classifyHr,
  estimatedMaxHeartRate,
  GARMIN_HR_ZONE_TEMPLATE,
  garminHeartRateZones,
  validateZones,
} from "../src/hr-zones.js";

describe("Garmin activity types", () => {
  it("has a group for every type", () => {
    for (const t of ACTIVITY_TYPES) expect(ACTIVITY_TYPE_INFO[t].group).toBeTruthy();
    expect(ACTIVITY_TYPE_INFO.TREADMILL_RUNNING.group).toBe("running");
    expect(isActivityType("TRAIL_RUNNING")).toBe(true);
    expect(isActivityType("TrailRun")).toBe(false);
  });
});

describe("Garmin heart-rate zones", () => {
  it("builds the five % max HR zones with Garmin names", () => {
    const zones = garminHeartRateZones(190);
    expect(validateZones(zones)).toEqual([]);
    expect(zones.map((z) => [z.name, z.minBpm, z.maxBpm])).toEqual([
      ["Warm Up", null, 113], // 50–60 % → open below, up to 114−1
      ["Easy", 114, 132],
      ["Aerobic", 133, 151],
      ["Threshold", 152, 170],
      ["Maximum", 171, null],
    ]);
    expect(zones.map((z) => z.color)).toEqual(GARMIN_HR_ZONE_TEMPLATE.map((z) => z.color));
    expect(classifyHr(150, zones)?.name).toBe("Aerobic");
  });

  it("estimates max HR as 220 minus age", () => {
    expect(estimatedMaxHeartRate(42)).toBe(178);
    expect(() => estimatedMaxHeartRate(0)).toThrow(RangeError);
    expect(() => estimatedMaxHeartRate(Number.NaN)).toThrow(RangeError);
    expect(() => garminHeartRateZones(60)).toThrow(RangeError);
  });
});

describe("Training Readiness levels", () => {
  it.each([
    [100, "PRIME"],
    [95, "PRIME"],
    [94, "HIGH"],
    [75, "HIGH"],
    [74, "MODERATE"],
    [50, "MODERATE"],
    [49, "LOW"],
    [25, "LOW"],
    [24, "POOR"],
    [1, "POOR"],
  ] as const)("%d → %s", (score, level) => {
    expect(trainingReadinessLevel(score)).toBe(level);
  });

  it("rejects out-of-range scores and lists the six factors", () => {
    expect(() => trainingReadinessLevel(0)).toThrow(RangeError);
    expect(() => trainingReadinessLevel(101)).toThrow(RangeError);
    expect(TRAINING_READINESS_FACTORS).toHaveLength(6);
  });
});

describe("HRV Status", () => {
  const base = { historyNights: 30, baselineLow: 50, baselineHigh: 70 };

  it("is Balanced inside the baseline and Unbalanced above or below it", () => {
    expect(hrvStatus({ ...base, lastSevenNights: [60, 62, 58, 61, 59, 60, 60] })).toEqual({
      status: "BALANCED",
      sevenDayAverage: 60,
    });
    expect(hrvStatus({ ...base, lastSevenNights: [75, 76, 74, 75, 75] }).status).toBe("UNBALANCED");
    expect(hrvStatus({ ...base, lastSevenNights: [45, 46, 44, 45, 45] }).status).toBe("UNBALANCED");
  });

  it("is Low when well below the baseline and Poor below the age norm", () => {
    expect(hrvStatus({ ...base, lastSevenNights: [35, 36, 34, 35, 35] }).status).toBe("LOW");
    expect(
      hrvStatus({ ...base, lastSevenNights: [35, 36, 34, 35, 35], wellBelowFraction: 1 }).status,
    ).toBe("UNBALANCED");
    expect(
      hrvStatus({ ...base, ageNormLow: 40, lastSevenNights: [35, 36, 34, 35, 35] }).status,
    ).toBe("POOR");
  });

  it("has No status without enough nights or history", () => {
    expect(hrvStatus({ ...base, lastSevenNights: [60, 61, 0, Number.NaN] })).toEqual({
      status: "NO_STATUS",
      sevenDayAverage: 60.5,
    });
    expect(hrvStatus({ ...base, lastSevenNights: [] })).toEqual({
      status: "NO_STATUS",
      sevenDayAverage: null,
    });
    expect(
      hrvStatus({ ...base, historyNights: 20, lastSevenNights: [60, 60, 60, 60, 60] }).status,
    ).toBe("NO_STATUS");
  });

  it("rejects an invalid baseline", () => {
    expect(() =>
      hrvStatus({
        ...base,
        baselineLow: 70,
        baselineHigh: 50,
        lastSevenNights: [60, 60, 60, 60, 60],
      }),
    ).toThrow(RangeError);
  });
});

describe("Training Effect", () => {
  it.each([
    [0, "NO_BENEFIT"],
    [0.9, "NO_BENEFIT"],
    [1.0, "MINOR"],
    [1.94, "MINOR"],
    [1.96, "MAINTAINING"],
    [2.9, "MAINTAINING"],
    [3.0, "IMPACTING"],
    [4.2, "HIGHLY_IMPACTING"],
    [5.0, "OVERREACHING"],
  ] as const)("%d → %s", (value, benefit) => {
    expect(trainingEffectBenefit(value)).toBe(benefit);
  });

  it("rejects values outside 0–5", () => {
    expect(() => trainingEffectBenefit(-0.1)).toThrow(RangeError);
    expect(() => trainingEffectBenefit(5.1)).toThrow(RangeError);
  });
});

describe("Training Status, Load Focus and labels", () => {
  it("covers Garmin's vocabularies", () => {
    expect(TRAINING_STATUSES).toContain("PRODUCTIVE");
    expect(LOAD_FOCUS_CATEGORIES).toEqual(["LOW_AEROBIC", "HIGH_AEROBIC", "ANAEROBIC"]);
    expect(LOAD_FOCUS_FEEDBACK).toContain("ANAEROBIC_SHORTAGE");
    expect(ACUTE_LOAD_WINDOW_DAYS).toBe(10);
  });
});
