import { DEFAULT_ATHLETE_SETTINGS } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { hrZonesView, lowerBoundsFromMax, manualZones } from "../src/zones.js";

describe("heart-rate zones view", () => {
  it("builds five colored zones from the starts of zones 2–5", () => {
    const zones = manualZones([120, 140, 158, 172]);
    expect(zones.map((z) => [z.minBpm, z.maxBpm])).toEqual([
      [null, 119],
      [120, 139],
      [140, 157],
      [158, 171],
      [172, null],
    ]);
    expect(zones.map((z) => z.color)).toEqual([
      "#9E9E9E",
      "#2F80ED",
      "#27AE60",
      "#F2994A",
      "#EB5757",
    ]);
    expect(lowerBoundsFromMax(190)).toEqual([114, 133, 152, 171]);
  });

  it("uses 220 − age without a max HR, and nothing without either", () => {
    const none = hrZonesView([], "2026-11-22", DEFAULT_ATHLETE_SETTINGS);
    expect(none).toMatchObject({ zones: [], maxHeartRate: null });
    const aged = hrZonesView([], "2026-11-22", {
      ...DEFAULT_ATHLETE_SETTINGS,
      birthDate: "1986-05-01",
    });
    expect(aged).toMatchObject({ origin: "garmin_default", maxHeartRate: 180, source: null });
    expect(aged.zones).toHaveLength(5);
  });
});
