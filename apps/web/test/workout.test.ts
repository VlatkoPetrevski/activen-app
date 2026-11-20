import { parseWorkout } from "@activen/domain";
import { createFormatter, createTranslator } from "@activen/i18n";
import { describe, expect, it } from "vitest";
import { durationText, targetText, workoutSummary } from "../src/training/WorkoutSteps.js";

const tr = createTranslator("mk");
const t = tr.t as Parameters<typeof workoutSummary>[1];
const f = createFormatter(tr);
const us = createFormatter(createTranslator("en"), "imperial");

describe("workout text", () => {
  it("summarises a structure in one line", () => {
    const s = parseWorkout("14 km со 6 × 1000 м на 5K темпо, одмор 2 мин")!;
    expect(workoutSummary(f, t, s)).toBe(
      "Загревање 2 km · 6 × 1 km @ 5K темпо / 2:00 · Смирување 4,3 km",
    );
    expect(workoutSummary(f, t, parseWorkout("10 km лесно (Zone 2)")!)).toBe("10 km @ Z2");
  });

  it("formats durations and targets in the user's units", () => {
    expect(durationText(f, t, { type: "distance", meters: 400 })).toBe("400 m");
    expect(durationText(us, t, { type: "distance", meters: 1609.344 })).toBe("1 mi");
    expect(durationText(f, t, { type: "time", seconds: 90 })).toBe("1:30");
    expect(durationText(f, t, { type: "open" })).toBe("до копче");
    expect(targetText(f, t, { type: "pace", low: 235, high: 245 })).toBe("4:00 /km");
    expect(targetText(f, t, { type: "pace", low: 230, high: 260 })).toBe("3:50–4:20 /km");
    expect(targetText(us, t, { type: "pace", low: 235, high: 245 })).toBe("6:26 /mi");
    expect(targetText(f, t, { type: "none" })).toBe("");
  });
});
