import { describe, expect, it } from "vitest";
import { buildDemoTraining, buildDemoWeather } from "../src/index.js";
import {
  DateRange,
  FeedbackPut,
  PlanEntryCreate,
  PlanEntryUpdate,
  SettingsPatch,
} from "../src/requests.js";

describe("request schemas", () => {
  it("validates date ranges", () => {
    expect(DateRange.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success).toBe(true);
    expect(DateRange.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success).toBe(false);
    expect(DateRange.safeParse({ from: "2025-01-01", to: "2026-11-30" }).success).toBe(false);
    expect(DateRange.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
  });

  it("defaults optional plan fields and requires a version for updates", () => {
    expect(
      PlanEntryCreate.parse({ calendarDate: "2026-11-20", kind: "rest", description: " Одмор " }),
    ).toEqual({
      calendarDate: "2026-11-20",
      kind: "rest",
      description: "Одмор",
      plannedActivityType: null,
      plannedDistanceInMeters: null,
      plannedDurationInSeconds: null,
      notes: null,
      sequence: 0,
      structure: null,
    });
    expect(PlanEntryUpdate.safeParse({ description: "x" }).success).toBe(false);
    // Structures are validated: a bad step or an empty workout is rejected.
    const step = {
      kind: "step",
      intensity: "active",
      duration: { type: "time", seconds: 600 },
      target: { type: "hr_zone", zone: 2 },
    };
    expect(
      PlanEntryUpdate.safeParse({ expectedVersion: 1, structure: { source: "ai", items: [step] } })
        .success,
    ).toBe(true);
    for (const structure of [
      { source: "ai", items: [] },
      { source: "ai", items: [{ ...step, target: { type: "hr_zone", zone: 9 } }] },
      { source: "robot", items: [step] },
    ])
      expect(PlanEntryUpdate.safeParse({ expectedVersion: 1, structure }).success).toBe(false);
    expect(PlanEntryUpdate.safeParse({ expectedVersion: 2, foo: 1 }).success).toBe(false);
    expect(
      PlanEntryCreate.safeParse({
        calendarDate: "2026-11-20",
        kind: "workout",
        description: "x",
        plannedActivityType: "PARKOUR",
      }).success,
    ).toBe(false);
  });

  it("bounds check-in values and settings", () => {
    expect(FeedbackPut.parse({ perceivedEffort: 7, feel: 3 })).toEqual({
      perceivedEffort: 7,
      feel: 3,
      comment: null,
    });
    expect(FeedbackPut.safeParse({ perceivedEffort: 11, feel: 3 }).success).toBe(false);
    expect(SettingsPatch.safeParse({ hrZones: { mode: "vendor", vendor: "manual" } }).success).toBe(
      false,
    );
  });
});

describe("demo training", () => {
  const today = "2026-11-19"; // Thursday
  const demo = buildDemoTraining({ today });

  it("is deterministic and covers the requested weeks", () => {
    expect(buildDemoTraining({ today })).toEqual(demo);
    expect(demo.planEntries).toHaveLength(7 * 11);
    expect(demo.planEntries[0]!.calendarDate).toBe("2026-09-21");
    expect(new Set(demo.planEntries.map((p) => p.key)).size).toBe(demo.planEntries.length);
  });

  it("has activities only before today and wellness up to today", () => {
    expect(demo.activities.length).toBeGreaterThan(30);
    expect(demo.activities.every((a) => a.calendarDate < today)).toBe(true);
    expect(demo.wellness.at(-1)).toMatchObject({ calendarDate: today, trainingReadiness: 72 });
    expect(demo.wellness.every((w) => w.calendarDate <= today)).toBe(true);
    const ids = new Set(demo.activities.map((a) => a.externalId));
    expect(demo.feedback.every((f) => ids.has(f.externalId))).toBe(true);
  });

  it("includes a coach signal and localized text", () => {
    expect(demo.feedback.some((f) => f.perceivedEffort === 9 && f.comment)).toBe(true);
    const en = buildDemoTraining({ today, locale: "en", weeksBack: 2, weeksAhead: 0 });
    expect(en.planEntries.find((p) => p.kind === "rest")!.description).toBe("Rest");
    expect(en.planEntries).toHaveLength(21);
    for (const a of demo.activities) {
      expect(a.durationInSeconds).toBeGreaterThan(0);
      if (a.activityType === "RUNNING") expect(a.distanceInMeters).toBeGreaterThan(5000);
    }
  });
});

describe("demo variations", () => {
  it("shifts the week pattern and can omit the heavy day", () => {
    const base = buildDemoTraining({ today: "2026-11-19", weeksBack: 1, weeksAhead: 0 });
    const shifted = buildDemoTraining({
      today: "2026-11-19",
      weeksBack: 1,
      weeksAhead: 0,
      weekShift: 1,
      heavyDay: false,
    });
    expect(base.planEntries[0]!.kind).toBe("rest");
    expect(shifted.planEntries[1]!.kind).toBe("rest");
    expect(shifted.feedback.some((f) => f.perceivedEffort === 9 && f.comment)).toBe(false);
  });
});

describe("demo weather", () => {
  it("has a full day with a cold morning and a warmer afternoon", () => {
    const w = buildDemoWeather();
    expect(w.hourly).toHaveLength(24);
    expect(w.hourly[14]!.temperature).toBeGreaterThan(w.hourly[6]!.temperature);
    expect(w.today.min).toBeLessThan(w.today.max);
    expect(w.airQuality!.europeanAqi).toBeGreaterThan(40);
    expect(buildDemoWeather()).toEqual(w);
  });
});
