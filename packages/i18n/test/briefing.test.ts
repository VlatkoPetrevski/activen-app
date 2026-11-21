import type { BriefingAdvice, Readiness } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { briefingText, createFormatter, createTranslator } from "../src/index.js";

const mk = createTranslator("mk");
const en = createTranslator("en");
const fmk = createFormatter(mk);
const fen = createFormatter(en);

const readiness: Readiness = {
  calendarDate: "2026-11-21",
  score: 40,
  level: "LOW",
  confidence: "high",
  vendorReadiness: null,
  factors: [
    {
      key: "sleep",
      status: "poor",
      score: 20,
      value: 5 * 3600 + 20 * 60,
      baseline: 8 * 3600,
      unit: "seconds",
    },
    { key: "hrv", status: "fair", score: 50, value: 52.4, baseline: 61, unit: "ms" },
    { key: "restingHr", status: "fair", score: 50, value: 55, baseline: 49, unit: "bpm" },
    { key: "load", status: "poor", score: 30, value: 1.62, baseline: 1, unit: "ratio" },
  ],
};

const advice = (o: Partial<BriefingAdvice>): BriefingAdvice => ({
  verdict: "swap_easy",
  intensity: "hard",
  reason: { kind: "factor", factor: "sleep", status: "poor" },
  change: { type: "easy_instead", toMeters: 8500, toSeconds: null, zone: 2 },
  needsAttention: true,
  ...o,
});

describe("briefingText", () => {
  it("says the verdict, the reason with the athlete's numbers and the concrete change", () => {
    expect(briefingText(mk, fmk, readiness, advice({}))).toEqual({
      verdict: "Замени со лесно",
      reason: expect.stringContaining("под потребата од 8"),
      change: expect.stringMatching(/^Лесно 8[.,]5 km, зона 2$/),
    });
    expect(briefingText(en, fen, readiness, advice({})).verdict).toBe("Swap for an easy session");
  });

  it("covers every reason", () => {
    const reason = (o: BriefingAdvice["reason"]) =>
      briefingText(en, fen, readiness, advice({ reason: o })).reason;
    expect(reason({ kind: "factor", factor: "restingHr", status: "fair" })).toBe(
      "Resting pulse 55 bpm, +6 above your usual 49.",
    );
    expect(reason({ kind: "factor", factor: "hrv", status: "fair" })).toBe(
      "HRV 52 ms, below your usual 61 ms.",
    );
    expect(reason({ kind: "factor", factor: "load", status: "poor" })).toBe(
      "This week's load is 1.6× your usual.",
    );
    const hidden = {
      ...readiness,
      factors: readiness.factors.map((f) => ({ ...f, value: null, baseline: null })),
    };
    expect(
      briefingText(
        en,
        fen,
        hidden,
        advice({ reason: { kind: "factor", factor: "load", status: "poor" } }),
      ).reason,
    ).toBe("This week's load is higher than usual.");
    expect(
      briefingText(
        en,
        fen,
        hidden,
        advice({ reason: { kind: "factor", factor: "restingHr", status: "poor" } }),
      ).reason,
    ).toContain("—");
    const scored = {
      ...readiness,
      factors: [
        {
          key: "sleep" as const,
          status: "fair" as const,
          score: 55,
          value: 55,
          baseline: null,
          unit: "score" as const,
        },
      ],
    };
    expect(briefingText(en, fen, scored, advice({})).reason).toBe(
      "Sleep score 55 — weaker than usual.",
    );
    for (const kind of ["all_good", "no_data", "rest_planned", "nothing_planned"] as const)
      expect(reason({ kind })).not.toMatch(/briefing\./);
  });

  it("covers every change", () => {
    const change = (c: BriefingAdvice["change"]) =>
      briefingText(en, fen, readiness, advice({ change: c })).change;
    expect(change({ type: "fewer_repeats", from: 6, to: 4 })).toBe("4 × instead of 6 ×");
    expect(
      change({
        type: "shorten",
        fromMeters: 24_000,
        toMeters: 19_000,
        fromSeconds: null,
        toSeconds: null,
      }),
    ).toBe("19 km instead of 24 km");
    expect(
      change({
        type: "shorten",
        fromMeters: null,
        toMeters: null,
        fromSeconds: 3600,
        toSeconds: 3000,
      }),
    ).toBe("50 min instead of 1 h 0 min");
    expect(change({ type: "easy_instead", toMeters: null, toSeconds: 2400, zone: 2 })).toBe(
      "Easy 40 min, zone 2",
    );
    expect(change({ type: "easy_instead", toMeters: null, toSeconds: null, zone: 2 })).toBe(
      "Easy, zone 2, by feel",
    );
    expect(change({ type: "rest_day" })).toMatch(/day off/);
    expect(change(null)).toBeNull();
  });
});
