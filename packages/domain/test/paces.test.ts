import { describe, expect, it } from "vitest";
import {
  goalPaces,
  paceKeyOf,
  parseGoal,
  parseWorkout,
  predictTime,
  resolvePace,
  riegel,
  trainingPaces,
  vdot,
  workoutBlocks,
  workoutTotals,
} from "../src/index.js";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

describe("VDOT (Daniels–Gilbert)", () => {
  it("matches Daniels' tables for a 3:30 marathon (VDOT ≈ 44.6)", () => {
    const v = vdot(42195, 3.5 * 3600);
    expect(v).toBeCloseTo(44.55, 1);
    const p = trainingPaces(v);
    expect(mmss(p.paces.M)).toBe("4:59");
    expect(mmss(p.paces.HM)).toBe("4:48");
    expect(mmss(p.paces.T)).toBe("4:40");
    expect(mmss(p.paces.I)).toBe("4:18");
    expect(p.paces.E[0]).toBeLessThan(p.paces.E[1]);
    // Predicted half ≈ 1:41, 10k ≈ 45:36.
    expect(Math.round(p.races.half / 60)).toBe(101);
    expect(Math.round(p.races["10k"] / 60)).toBe(46);
  });

  it("predicts back the time it was computed from, and Riegel is close", () => {
    const v = vdot(10000, 45 * 60);
    expect(predictTime(v, 10000)).toBeCloseTo(45 * 60, 0);
    const half = riegel(10000, 45 * 60, 21097.5);
    expect(Math.abs(half - predictTime(v, 21097.5))).toBeLessThan(120);
  });
});

describe("parseGoal", () => {
  it.each([
    ["маратон за 3:30", "marathon", 12600],
    ["Marathon 3h15", "marathon", 11700],
    ["HM 1:45", "half", 6300],
    ["полумаратон под 1:45:00", "half", 6300],
    ["10k 45 мин", "10k", 2700],
    ["5 км 22:30", "5k", 1350],
  ])("%s", (text, race, seconds) => {
    expect(parseGoal(text)).toMatchObject({ race, seconds });
  });

  it("reads no goal without a race and a plausible time", () => {
    expect(parseGoal("трчање за забава")).toBeNull();
    expect(parseGoal("маратон")).toBeNull();
    expect(parseGoal("маратон за 1:10")).toBeNull();
  });
});

describe("named paces", () => {
  it("knows the training paces by their usual names", () => {
    expect(paceKeyOf("M pace")).toBe("M");
    expect(paceKeyOf("маратонско темпо")).toBe("M");
    expect(paceKeyOf("HM темпо")).toBe("HM");
    expect(paceKeyOf("5K pace")).toBe("5K");
    expect(paceKeyOf("праг")).toBe("T");
    expect(paceKeyOf("брзо по чувство")).toBeNull();
  });

  it("turns a named pace into numbers from the goal", () => {
    const p = goalPaces(parseGoal("маратон за 3:30")!);
    expect(resolvePace("M pace", p)).toEqual({ key: "M", low: 294, high: 304 });
    expect(resolvePace("M pace", null)).toBeNull();
  });

  it("reads a coach's interval shorthand with km as k and the pace by name", () => {
    const s = parseWorkout("Интервали 2k wu + 6x1000 M pace / 500m jog + 2k CD")!;
    expect(s.items).toEqual([
      {
        kind: "step",
        intensity: "warmup",
        duration: { type: "distance", meters: 2000 },
        target: { type: "none" },
      },
      {
        kind: "repeat",
        count: 6,
        steps: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "distance", meters: 1000 },
            target: { type: "label", text: "M pace" },
          },
          {
            kind: "step",
            intensity: "recovery",
            duration: { type: "distance", meters: 500 },
            target: { type: "none" },
          },
        ],
      },
      {
        kind: "step",
        intensity: "cooldown",
        duration: { type: "distance", meters: 2000 },
        target: { type: "none" },
      },
    ]);
  });
});

describe("workoutTotals", () => {
  it("adds the interval session up with the goal's paces (last recovery not run)", () => {
    const s = parseWorkout("Интервали 2k wu + 6x1000 M pace / 500m jog + 2k CD")!;
    const p = goalPaces(parseGoal("маратон за 3:30")!);
    const total = workoutTotals(s, p);
    // 2 + 6 + 5 × 0.5 + 2 km.
    expect(total.meters).toBe(12500);
    expect(total.estimated).toBe(false);
    // 6 km at M (≈4:59) + 6.5 km easy (≈5:54) ≈ 68 min.
    expect(Math.round(total.seconds / 60)).toBeGreaterThanOrEqual(66);
    expect(Math.round(total.seconds / 60)).toBeLessThanOrEqual(70);
  });

  it("says when a pace had to be guessed (no goal for a named pace)", () => {
    const s = parseWorkout("6x1000 M pace / 500m jog")!;
    expect(workoutTotals(s, null).estimated).toBe(true);
    const timed = parseWorkout("Велосипед 60 мин лесно")!;
    expect(workoutTotals(timed, null)).toMatchObject({ seconds: 3600, estimated: true });
  });
});

describe("workoutBlocks", () => {
  it("colors the interval session by zone: easy around, marathon pace in zone 3", () => {
    const s = parseWorkout("Интервали 2k wu + 6x1000 M pace / 500m jog + 2k CD")!;
    const blocks = workoutBlocks(s, goalPaces(parseGoal("маратон за 3:30")!));
    expect(blocks).toHaveLength(1 + 6 + 5 + 1);
    expect(blocks.map((b) => b.zone).join("")).toBe("1313131313131");
    expect(blocks[1]?.seconds).toBe(299);
  });
});
