import { describe, expect, it } from "vitest";
import { addDays } from "../src/dates.js";
import {
  briefingAdvice,
  computeReadiness,
  hrvFactor,
  loadFactor,
  mergeWellness,
  restingHrFactor,
  sessionIntensity,
  sleepFactor,
  type Readiness,
  type WellnessDay,
  type WellnessRecord,
} from "../src/readiness.js";
import { parseWorkout } from "../src/workout.js";
import { activity, plan } from "./fixtures.js";

const TODAY = "2026-11-21";

function record(overrides: Partial<WellnessRecord> & { calendarDate: string }): WellnessRecord {
  return {
    source: "polar",
    sleepDurationInSeconds: null,
    sleepScore: null,
    sleepQuality: null,
    restingHeartRate: null,
    lastNightHrvMs: null,
    vendorReadiness: null,
    ...overrides,
  };
}

/** 14 ordinary mornings before today: 7.5 h sleep, RHR 48–50, HRV 60–64. */
function history(): WellnessRecord[] {
  return Array.from({ length: 14 }, (_, i) =>
    record({
      calendarDate: addDays(TODAY, -(i + 1)),
      sleepDurationInSeconds: 7.5 * 3600,
      restingHeartRate: 48 + (i % 3),
      lastNightHrvMs: 60 + (i % 5),
    }),
  );
}

/** Steady 4 runs a week for 4 weeks. */
function steadyTraining() {
  return Array.from({ length: 16 }, (_, i) =>
    activity({ calendarDate: addDays(TODAY, -1 - Math.floor(i * 1.75)), trainingLoad: 60 }),
  );
}

function readinessFor(today: Partial<WellnessRecord>, activities = steadyTraining()) {
  const wellness = mergeWellness([...history(), record({ calendarDate: TODAY, ...today })]);
  return computeReadiness({ calendarDate: TODAY, wellness, activities });
}

describe("mergeWellness", () => {
  it("takes each field from the best source and keeps where it came from", () => {
    const [day] = mergeWellness(
      [
        record({ calendarDate: TODAY, source: "garmin", sleepScore: 80, restingHeartRate: 50 }),
        record({ calendarDate: TODAY, source: "polar", restingHeartRate: 49, lastNightHrvMs: 55 }),
        record({ calendarDate: TODAY, source: "manual", restingHeartRate: 47 }),
      ],
      ["polar", "garmin"],
    );
    expect(day).toMatchObject({
      sleepScore: 80,
      restingHeartRate: 47,
      lastNightHrvMs: 55,
      sources: { sleepScore: "garmin", restingHeartRate: "manual", lastNightHrvMs: "polar" },
    });
  });

  it("sorts days and ranks unknown vendors after the priority list", () => {
    const days = mergeWellness(
      [
        record({ calendarDate: TODAY, source: "suunto", restingHeartRate: 51 }),
        record({ calendarDate: TODAY, source: "garmin", restingHeartRate: 50 }),
        record({ calendarDate: "2026-11-19", source: "suunto", restingHeartRate: 52 }),
      ],
      ["garmin"],
    );
    expect(days.map((d) => d.calendarDate)).toEqual(["2026-11-19", TODAY]);
    expect(days[1]?.sources.restingHeartRate).toBe("garmin");
  });
});

describe("factors", () => {
  const day = (o: Partial<WellnessDay>): WellnessDay => ({
    calendarDate: TODAY,
    sleepDurationInSeconds: null,
    sleepScore: null,
    sleepQuality: null,
    restingHeartRate: null,
    lastNightHrvMs: null,
    vendorReadiness: null,
    sources: {},
    ...o,
  });

  it("sleep uses the vendor score when present, else duration against the need", () => {
    expect(
      sleepFactor(day({ sleepScore: 82, sleepDurationInSeconds: 3600 }), 8 * 3600),
    ).toMatchObject({ score: 82, unit: "score", status: "good" });
    expect(sleepFactor(day({ sleepDurationInSeconds: 8 * 3600 }), 8 * 3600).score).toBe(100);
    expect(sleepFactor(day({ sleepDurationInSeconds: 6 * 3600 }), 8 * 3600)).toMatchObject({
      score: 50,
      status: "fair",
      baseline: 8 * 3600,
    });
    expect(sleepFactor(day({ sleepDurationInSeconds: 3.5 * 3600 }), 8 * 3600).score).toBe(0);
    expect(sleepFactor(undefined, 8 * 3600).status).toBe("missing");
    // The athlete's rating: alone, or averaged with the duration range.
    const manual = { sleepDurationInSeconds: "manual", sleepQuality: "manual" } as const;
    expect(sleepFactor(day({ sleepQuality: 5, sources: manual }), 8 * 3600)).toMatchObject({
      score: 100,
      value: null,
      quality: 5,
    });
    expect(
      sleepFactor(
        day({ sleepQuality: 1, sleepDurationInSeconds: 8 * 3600, sources: manual }),
        8 * 3600,
      ),
    ).toMatchObject({ score: 55, value: 8 * 3600, quality: 1 });
    expect(
      sleepFactor(
        day({ sleepScore: 90, sleepQuality: 2, sources: { sleepQuality: "manual" } }),
        8 * 3600,
      ),
    ).toMatchObject({ score: 35, unit: "seconds" });
    // Typed-in sleep wins over the watch's score of the same night.
    expect(
      sleepFactor(
        day({
          sleepScore: 85,
          sleepDurationInSeconds: 4 * 3600,
          sources: { sleepDurationInSeconds: "manual" },
        }),
        8 * 3600,
      ),
    ).toMatchObject({ unit: "seconds", score: 0 });
    expect(sleepFactor(day({ sleepDurationInSeconds: 0 }), 8 * 3600).status).toBe("missing");
  });

  it("resting HR compares with the median and needs five mornings", () => {
    const h = [48, 49, 50, 48, 49];
    expect(restingHrFactor(49, h)).toMatchObject({ score: 100, baseline: 49 });
    expect(restingHrFactor(45, h).score).toBe(100);
    expect(restingHrFactor(52, h).score).toBe(75);
    expect(restingHrFactor(55, h)).toMatchObject({ score: 40, status: "fair" });
    expect(restingHrFactor(60, h)).toMatchObject({ score: 0, status: "poor" });
    expect(restingHrFactor(50, [48, 49]).status).toBe("missing");
    expect(restingHrFactor(null, h).status).toBe("missing");
    expect(restingHrFactor(50, [48, 50, 49, 51]).status).toBe("missing");
    expect(restingHrFactor(50, [48, 50, 49, 51, 47, 52]).baseline).toBe(50); // even count median
  });

  it("HRV scores standard deviations below the baseline, with a floor on the SD", () => {
    const h = [60, 62, 64, 58, 61, 63, 59];
    expect(hrvFactor(65, h).score).toBe(100);
    const one = hrvFactor(61 - 3.1, h);
    expect(one.score).toBeGreaterThan(55);
    expect(one.score).toBeLessThan(75);
    expect(hrvFactor(45, h).score).toBe(0);
    // Perfectly stable history: a 1 ms dip must not look like −∞ SD.
    expect(hrvFactor(59, [60, 60, 60, 60, 60]).score).toBeGreaterThan(80);
    expect(hrvFactor(59, [60, 60]).status).toBe("missing");
  });

  it("load uses acute:chronic and falls back to minutes when a load is missing", () => {
    const steady = loadFactor(TODAY, steadyTraining());
    expect(steady.value).toBeGreaterThan(0.8);
    expect(steady.value).toBeLessThan(1.3);
    expect(steady.status).toBe("good");

    const spike = [
      ...steadyTraining(),
      ...Array.from({ length: 5 }, (_, i) =>
        activity({ calendarDate: addDays(TODAY, -1 - i), trainingLoad: 150 }),
      ),
    ];
    expect(loadFactor(TODAY, spike).status).toBe("poor");

    const minutes = loadFactor(TODAY, [
      activity({
        calendarDate: addDays(TODAY, -2),
        trainingLoad: null,
        movingDurationInSeconds: 3600,
      }),
      activity({
        calendarDate: addDays(TODAY, -20),
        trainingLoad: 50,
        movingDurationInSeconds: 3600,
      }),
    ]);
    expect(minutes.value).toBe(2); // 60 min acute vs 120 min / 4 weeks
    expect(loadFactor(TODAY, []).status).toBe("missing");
    expect(loadFactor(TODAY, [activity({ calendarDate: TODAY, trainingLoad: 80 })]).status).toBe(
      "missing",
    );
    expect(
      loadFactor(TODAY, [
        activity({ calendarDate: addDays(TODAY, -3), deleted: true, trainingLoad: 80 }),
      ]).status,
    ).toBe("missing");
    expect(
      loadFactor(TODAY, [
        activity({
          calendarDate: addDays(TODAY, -3),
          trainingLoad: null,
          movingDurationInSeconds: 0,
          durationInSeconds: 0,
        }),
      ]).status,
    ).toBe("missing");
  });
});

describe("computeReadiness", () => {
  it("a normal morning is HIGH with high confidence", () => {
    const r = readinessFor({
      sleepDurationInSeconds: 7.8 * 3600,
      restingHeartRate: 48,
      lastNightHrvMs: 63,
    });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.level).toMatch(/HIGH|PRIME/);
    expect(r.confidence).toBe("high");
    expect(r.factors.map((f) => f.key)).toEqual(["sleep", "hrv", "restingHr", "load"]);
  });

  it("one very poor factor caps readiness at LOW", () => {
    const r = readinessFor({
      sleepDurationInSeconds: 3.8 * 3600,
      restingHeartRate: 48,
      lastNightHrvMs: 63,
    });
    expect(r.score).toBeLessThanOrEqual(49);
    expect(r.level).toBe("LOW");
  });

  it("two very poor factors mean rest", () => {
    const r = readinessFor({
      sleepDurationInSeconds: 4 * 3600,
      restingHeartRate: 60,
      lastNightHrvMs: 63,
    });
    expect(r.score).toBeLessThanOrEqual(24);
    expect(r.level).toBe("POOR");
  });

  it("works with only what the athlete typed in (sleep and pulse), renormalising weights", () => {
    const wellness = mergeWellness([
      ...history().map((h) => ({ ...h, lastNightHrvMs: null })),
      record({
        calendarDate: TODAY,
        source: "manual",
        sleepDurationInSeconds: 8 * 3600,
        restingHeartRate: 49,
      }),
    ]);
    const r = computeReadiness({ calendarDate: TODAY, wellness, activities: [] });
    expect(r.score).toBe(100);
    expect(r.confidence).toBe("medium");
    expect(r.factors.find((f) => f.key === "hrv")?.status).toBe("missing");
  });

  it("no morning data → no score, even with training load", () => {
    const r = computeReadiness({
      calendarDate: TODAY,
      wellness: mergeWellness(history()),
      activities: steadyTraining(),
    });
    expect(r).toMatchObject({ score: null, level: null, confidence: "none" });
  });

  it("one factor only → low confidence; vendor readiness is passed through; sleep need is honoured", () => {
    const wellness = mergeWellness([
      record({ calendarDate: TODAY, sleepDurationInSeconds: 7 * 3600, vendorReadiness: 71 }),
    ]);
    const r = computeReadiness({
      calendarDate: TODAY,
      wellness,
      activities: [],
      sleepNeedSeconds: 7 * 3600,
    });
    expect(r).toMatchObject({ score: 100, confidence: "low", vendorReadiness: 71 });
  });

  it("ignores days after the assessed morning and before the baseline window", () => {
    const wellness = mergeWellness([
      ...history(),
      record({ calendarDate: addDays(TODAY, 1), restingHeartRate: 90 }),
      record({ calendarDate: addDays(TODAY, -40), restingHeartRate: 90 }),
      record({ calendarDate: TODAY, restingHeartRate: 49 }),
    ]);
    const r = computeReadiness({ calendarDate: TODAY, wellness, activities: [] });
    expect(r.factors.find((f) => f.key === "restingHr")?.baseline).toBe(49);
  });
});

describe("sessionIntensity", () => {
  it("classifies rest, hard (structure or words), long and easy", () => {
    expect(sessionIntensity(plan({ calendarDate: TODAY, kind: "rest" }))).toBe("rest");
    const intervals = parseWorkout("14 km with 6 × 1000 m at 4:00/km, 2 min rest");
    expect(
      sessionIntensity(plan({ calendarDate: TODAY, description: "Session", structure: intervals })),
    ).toBe("hard");
    expect(sessionIntensity(plan({ calendarDate: TODAY, description: "8 km темпо" }))).toBe("hard");
    expect(
      sessionIntensity(
        plan({ calendarDate: TODAY, description: "Long run", plannedDistanceInMeters: 24_000 }),
      ),
    ).toBe("long");
    expect(
      sessionIntensity(
        plan({ calendarDate: TODAY, description: "Bike", plannedDurationInSeconds: 2 * 3600 }),
      ),
    ).toBe("long");
    expect(
      sessionIntensity(plan({ calendarDate: TODAY, description: "10 km лесно (Zone 2)" })),
    ).toBe("easy");
    expect(sessionIntensity(plan({ calendarDate: TODAY, description: "6 × 1 km @ 4:00" }))).toBe(
      "hard",
    );
    const zone4 = parseWorkout("10 km (Zone 4)");
    expect(
      sessionIntensity(plan({ calendarDate: TODAY, description: "Session", structure: zone4 })),
    ).toBe("hard");
  });
});

describe("briefingAdvice", () => {
  const readiness = (score: number | null): Readiness => ({
    calendarDate: TODAY,
    score,
    level: null,
    confidence: score == null ? "none" : "high",
    factors: [
      {
        key: "sleep",
        status: "poor",
        score: 30,
        value: 5 * 3600,
        baseline: 8 * 3600,
        unit: "seconds",
      },
      { key: "restingHr", status: "good", score: 90, value: 49, baseline: 48, unit: "bpm" },
      { key: "hrv", status: "missing", score: null, value: null, baseline: null, unit: "ms" },
    ],
    vendorReadiness: null,
  });
  const hard = plan({
    calendarDate: TODAY,
    description: "Интервали",
    plannedDistanceInMeters: 14_000,
    structure: parseWorkout("Загревање 3 km, 6 × 1 km на 4:00/km, одмор 400 m, смирување 2 km"),
  });
  const easy = plan({
    calendarDate: TODAY,
    description: "10 km лесно",
    plannedDistanceInMeters: 10_000,
  });
  const long = plan({
    calendarDate: TODAY,
    description: "Long",
    plannedDistanceInMeters: 24_000,
    plannedDurationInSeconds: 2.25 * 3600,
  });

  it("high readiness → as planned", () => {
    expect(briefingAdvice(readiness(82), hard)).toMatchObject({
      verdict: "as_planned",
      change: null,
      needsAttention: false,
    });
  });

  it("moderate: easy stays, hard loses a third of the repeats, long is 20 % shorter", () => {
    expect(briefingAdvice(readiness(60), easy).verdict).toBe("as_planned");
    expect(briefingAdvice(readiness(60), hard)).toMatchObject({
      verdict: "ease_off",
      change: { type: "fewer_repeats", from: 6, to: 4 },
      reason: { kind: "factor", factor: "sleep", status: "poor" },
      needsAttention: false,
    });
    expect(briefingAdvice(readiness(60), long).change).toEqual({
      type: "shorten",
      fromMeters: 24_000,
      toMeters: 19_000,
      fromSeconds: 8100,
      toSeconds: 6600,
    });
  });

  it("low: hard and long become easy (coach is flagged), easy is shortened", () => {
    expect(briefingAdvice(readiness(40), hard)).toMatchObject({
      verdict: "swap_easy",
      change: { type: "easy_instead", toMeters: 10_000, zone: 2 },
      needsAttention: true,
    });
    expect(briefingAdvice(readiness(40), easy)).toMatchObject({
      verdict: "ease_off",
      change: { type: "shorten", toMeters: 7_500 },
      needsAttention: false,
    });
  });

  it("poor → rest; flagged only when a demanding session was planned", () => {
    expect(briefingAdvice(readiness(20), long)).toMatchObject({
      verdict: "rest",
      change: { type: "rest_day" },
      needsAttention: true,
    });
    expect(briefingAdvice(readiness(20), easy)).toMatchObject({
      verdict: "rest",
      needsAttention: false,
    });
  });

  it("rest day, no data, nothing planned", () => {
    expect(
      briefingAdvice(readiness(20), plan({ calendarDate: TODAY, kind: "rest" })).reason,
    ).toEqual({ kind: "rest_planned" });
    expect(briefingAdvice(readiness(null), hard)).toMatchObject({
      verdict: "as_planned",
      reason: { kind: "no_data" },
    });
    expect(briefingAdvice(readiness(80), null)).toMatchObject({
      verdict: "as_planned",
      reason: { kind: "nothing_planned" },
      intensity: null,
    });
    expect(briefingAdvice(readiness(40), null).verdict).toBe("ease_off");
    expect(briefingAdvice(readiness(10), null).verdict).toBe("rest");
  });

  it("all factors good → reason all_good; a size-less easy session gets no change", () => {
    const good: Readiness = {
      ...readiness(45),
      factors: [
        { key: "sleep", status: "good", score: 90, value: 1, baseline: 1, unit: "seconds" },
      ],
    };
    expect(briefingAdvice(good, hard).reason).toEqual({ kind: "all_good" });
    expect(
      briefingAdvice(readiness(40), plan({ calendarDate: TODAY, description: "Easy jog" })).change,
    ).toBeNull();
  });

  it("a hard session without a size and without a repeat block", () => {
    const tempo = plan({
      calendarDate: TODAY,
      description: "Темпо трчање",
      plannedDurationInSeconds: 3600,
    });
    expect(briefingAdvice(readiness(60), tempo).change).toMatchObject({
      type: "shorten",
      toSeconds: 3000,
    });
    expect(briefingAdvice(readiness(40), tempo).change).toEqual({
      type: "easy_instead",
      toMeters: null,
      toSeconds: 2400,
      zone: 2,
    });
  });
});
