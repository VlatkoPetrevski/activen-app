import { describe, expect, it } from "vitest";
import { polarRecharge, polarSleep } from "../src/connections/polar-wellness.js";

describe("Polar wellness mapping", () => {
  it("dates sleep by the morning it ended, sums the stages and keeps the score", () => {
    expect(
      polarSleep({
        date: "2026-11-20",
        sleep_end_time: "2026-11-21T06:30:00+01:00",
        light_sleep: 10_000.4,
        deep_sleep: 5_000,
        rem_sleep: 6_000,
        sleep_score: 81.6,
      }),
    ).toEqual({
      calendarDate: "2026-11-21",
      fields: { sleepDurationInSeconds: 21_000, sleepScore: 82 },
    });
    expect(polarSleep({ date: "2026-11-21" })).toEqual({
      calendarDate: "2026-11-21",
      fields: { sleepDurationInSeconds: null, sleepScore: null },
    });
    expect(polarSleep({ sleep_end_time: "junk" })).toBeNull();
    expect(polarSleep({ date: "2026-11-21", light_sleep: -5, sleep_score: 140 })?.fields).toEqual({
      sleepDurationInSeconds: null,
      sleepScore: null,
    });
  });

  it("maps Nightly Recharge to resting HR, HRV and a 17–100 readiness", () => {
    expect(
      polarRecharge({
        date: "2026-11-21",
        heart_rate_avg: 48.6,
        heart_rate_variability_avg: 61.5,
        nightly_recharge_status: 6,
      }),
    ).toEqual({
      calendarDate: "2026-11-21",
      fields: { restingHeartRate: 49, lastNightHrvMs: 61.5, vendorReadiness: 100 },
    });
    expect(polarRecharge({ date: "2026-11-21", nightly_recharge_status: 1 })?.fields).toEqual({
      restingHeartRate: null,
      lastNightHrvMs: null,
      vendorReadiness: 17,
    });
    expect(polarRecharge({ date: "x" })).toBeNull();
    expect(polarRecharge({})).toBeNull();
    expect(
      polarRecharge({ date: "2026-11-21", heart_rate_avg: 900, nightly_recharge_status: 9 })
        ?.fields,
    ).toEqual({ restingHeartRate: null, lastNightHrvMs: null, vendorReadiness: null });
  });
});
