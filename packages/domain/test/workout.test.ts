import { describe, expect, it } from "vitest";
import { flattenWorkout, parseTarget, parseWorkout, type WorkoutRepeat } from "../src/index.js";

describe("parseTarget", () => {
  it("reads pace, pace ranges, zones and named efforts", () => {
    expect(parseTarget("на 4:00/km")).toEqual({ type: "pace", low: 235, high: 245 });
    expect(parseTarget("3:55–4:05")).toEqual({ type: "pace", low: 235, high: 245 });
    expect(parseTarget("лесно Z2")).toEqual({ type: "hr_zone", zone: 2 });
    expect(parseTarget("зона 3")).toEqual({ type: "hr_zone", zone: 3 });
    expect(parseTarget("на 5K темпо")).toEqual({ type: "label", text: "5K темпо" });
    expect(parseTarget("at marathon pace, 2 min rest")).toEqual({
      type: "label",
      text: "marathon pace",
    });
    expect(parseTarget("брзо")).toEqual({ type: "none" });
  });

  it("orders reversed ranges and ignores times that cannot be paces", () => {
    expect(parseTarget("4:05–3:55")).toEqual({ type: "pace", low: 235, high: 245 });
    expect(parseTarget("4:05-3:55/km")).toEqual({ type: "pace", low: 235, high: 245 });
    // 0:45 is not a running pace; 4:75 is not a time.
    expect(parseTarget("0:45")).toEqual({ type: "none" });
    expect(parseTarget("4:75")).toEqual({ type: "none" });
    expect(parseTarget("0:30–0:40")).toEqual({ type: "none" });
    // Near the edges the window stays inside the plausible range.
    expect(parseTarget("1:32")).toEqual({ type: "pace", low: 90, high: 97 });
  });
});

describe("parseWorkout", () => {
  it("parses distance reps with a named pace and fills warm-up and cool-down", () => {
    const s = parseWorkout("14 km со 6 × 1000 м на 5K темпо");
    expect(s?.source).toBe("parser");
    expect(s?.items[0]).toMatchObject({
      intensity: "warmup",
      duration: { type: "distance", meters: 2000 },
    });
    const rep = s?.items[1] as WorkoutRepeat;
    expect(rep).toMatchObject({ kind: "repeat", count: 6 });
    expect(rep.steps[0]).toEqual({
      kind: "step",
      intensity: "active",
      duration: { type: "distance", meters: 1000 },
      target: { type: "label", text: "5K темпо" },
    });
    // 14 km − 2 km warm-up − 6 km of reps = 6 km to cool down.
    expect(s?.items[2]).toMatchObject({ intensity: "cooldown", duration: { meters: 6000 } });
  });

  it("parses time reps with a recovery after a slash", () => {
    const s = parseWorkout("12 km фартлек 10 × 1 мин брзо / 1 мин лесно");
    const rep = s?.items[1] as WorkoutRepeat;
    expect(rep.count).toBe(10);
    expect(rep.steps.map((x) => x.duration)).toEqual([
      { type: "time", seconds: 60 },
      { type: "time", seconds: 60 },
    ]);
    expect(rep.steps[1]?.intensity).toBe("recovery");
    expect(flattenWorkout(s!)).toHaveLength(1 + 10 + 9 + 1);
  });

  it("uses explicit warm-up, recovery, pace and cool-down", () => {
    const s = parseWorkout("Загревање 3 km, 4 × 2 km на 4:00/km, одмор 400 m, смирување 2 km");
    expect(s?.items[0]).toMatchObject({ duration: { meters: 3000 } });
    const rep = s?.items[1] as WorkoutRepeat;
    expect(rep.steps[0]?.target).toEqual({ type: "pace", low: 235, high: 245 });
    expect(rep.steps[1]?.duration).toEqual({ type: "distance", meters: 400 });
    expect(s?.items[2]).toMatchObject({ intensity: "cooldown", duration: { meters: 2000 } });
    const en = parseWorkout("warm up 15 min, 5 x 3 min at 3:50-4:00, 2 min rest, cool down 10 min");
    expect(en?.items[0]).toMatchObject({ duration: { type: "time", seconds: 900 } });
    expect((en?.items[1] as WorkoutRepeat).steps[0]?.target).toEqual({
      type: "pace",
      low: 230,
      high: 240,
    });
    expect(en?.items[2]).toMatchObject({ duration: { type: "time", seconds: 600 } });
  });

  it("parses steady sessions and leaves free text alone", () => {
    expect(parseWorkout("10 km лесно (Zone 2)")?.items).toEqual([
      {
        kind: "step",
        intensity: "active",
        duration: { type: "distance", meters: 10_000 },
        target: { type: "hr_zone", zone: 2 },
      },
    ]);
    expect(parseWorkout("Велосипед 60 мин лесно")?.items[0]).toMatchObject({
      duration: { type: "time", seconds: 3600 },
      target: { type: "hr_zone", zone: 2 },
    });
    expect(parseWorkout("Long run 28 km")?.items[0]).toMatchObject({ target: { type: "none" } });
    expect(parseWorkout("Одмор")).toBeNull();
    expect(parseWorkout("  ")).toBeNull();
    expect(parseWorkout("1.5 h ride")?.items[0]).toMatchObject({ duration: { seconds: 5400 } });
  });
});

describe("parseWorkout edge cases", () => {
  it("handles miles, hours, seconds and words after the number", () => {
    expect(parseWorkout("5 mi easy")?.items[0]).toMatchObject({
      duration: { type: "distance", meters: 8047 },
      target: { type: "hr_zone", zone: 2 },
    });
    const s = parseWorkout("2 km warm up, 10 x 30 sec hard / 90 s jog, 1 km cool down");
    expect(s?.items[0]).toMatchObject({ duration: { meters: 2000 } });
    const rep = s?.items[1] as WorkoutRepeat;
    expect(rep.steps.map((x) => x.duration)).toEqual([
      { type: "time", seconds: 30 },
      { type: "time", seconds: 90 },
    ]);
    expect(s?.items[2]).toMatchObject({ duration: { meters: 1000 } });
    expect(parseWorkout("2 ч велосипед")?.items[0]).toMatchObject({ duration: { seconds: 7200 } });
  });

  it("uses a short default cool-down without a total, and a rest step in flatten", () => {
    const s = parseWorkout("4 × 1 km на 4:00/km, одмор 2 мин");
    expect(s?.items.at(-1)).toMatchObject({ intensity: "cooldown", duration: { meters: 1000 } });
    expect(flattenWorkout(s!).map((x) => x.intensity)).toEqual([
      "warmup",
      "active",
      "recovery",
      "active",
      "recovery",
      "active",
      "recovery",
      "active",
      "cooldown",
    ]);
    // A total too small for a cool-down falls back to the default 1 km.
    expect(parseWorkout("5 km со 4 × 1 km")?.items.at(-1)).toMatchObject({
      duration: { meters: 1000 },
    });
  });
});
