import { describe, expect, it } from "vitest";
import {
  classifyHr,
  createProfileVersion,
  DEFAULT_HR_ZONES,
  InvalidHrZoneProfileError,
  profileForDate,
  validateZones,
} from "../src/hr-zones.js";
import type { HrZone } from "../src/types.js";
import { defaultProfile } from "./fixtures.js";

const zones = DEFAULT_HR_ZONES;
const codes = (z: HrZone[]) => validateZones(z).map((e) => e.code);

describe("validateZones (HR-03)", () => {
  it("accepts the default profile", () => {
    expect(validateZones(zones)).toEqual([]);
  });

  it("rejects an empty profile", () => {
    expect(codes([])).toEqual(["EMPTY"]);
  });

  it("detects gaps and overlaps between zones", () => {
    const gap = zones.map((z) => ({ ...z }));
    gap[1] = { ...gap[1]!, minBpm: 141 };
    expect(codes(gap)).toContain("GAP_OR_OVERLAP");

    const overlap = zones.map((z) => ({ ...z }));
    overlap[2] = { ...overlap[2]!, minBpm: 150 };
    expect(codes(overlap)).toContain("GAP_OR_OVERLAP");
  });

  it("requires open-ended first and last zones", () => {
    const z = zones.map((x) => ({ ...x }));
    z[0] = { ...z[0]!, minBpm: 100 };
    z[4] = { ...z[4]!, maxBpm: 200 };
    expect(codes(z)).toEqual(
      expect.arrayContaining(["FIRST_MIN_MUST_BE_OPEN", "LAST_MAX_MUST_BE_OPEN"]),
    );
  });

  it("validates names, colors and bounds", () => {
    const z: HrZone[] = [
      { name: " ", minBpm: null, maxBpm: 139.5, color: "red" },
      { name: "Easy", minBpm: null, maxBpm: 20, color: "#FFFFFF" },
      { name: "easy", minBpm: 160, maxBpm: 150, color: "#FFFFFF" },
      { name: "Top", minBpm: 151, maxBpm: null, color: "#FFFFFF" },
    ];
    expect(codes(z)).toEqual(
      expect.arrayContaining([
        "NAME_REQUIRED",
        "COLOR_INVALID",
        "BOUND_NOT_INTEGER",
        "BOUND_REQUIRED",
        "BOUND_OUT_OF_RANGE",
        "NAME_DUPLICATE",
        "MIN_GREATER_THAN_MAX",
      ]),
    );
  });

  it("accepts a single all-covering zone", () => {
    expect(validateZones([{ name: "All", minBpm: null, maxBpm: null, color: "#000000" }])).toEqual(
      [],
    );
  });
});

describe("classifyHr", () => {
  it.each([
    [120, "Easy"],
    [139, "Easy"],
    [140, "AeT"],
    [150, "AeT"],
    [151, "Tempo"],
    [165, "Tempo"],
    [166, "AnT"],
    [171, "AnT"],
    [172, "VO2max"],
    [195, "VO2max"],
  ])("classifies %d bpm as %s (spec §9 defaults)", (hr, expected) => {
    expect(classifyHr(hr, zones)?.name).toBe(expected);
  });

  it("puts fractional averages above a bound into the next zone", () => {
    expect(classifyHr(139.4, zones)?.name).toBe("AeT");
  });

  it("returns null when HR is missing or invalid (no zone, no color)", () => {
    expect(classifyHr(null, zones)).toBeNull();
    expect(classifyHr(0, zones)).toBeNull();
    expect(classifyHr(Number.NaN, zones)).toBeNull();
  });

  it("returns null when zones do not reach the value", () => {
    expect(
      classifyHr(200, [{ name: "Low", minBpm: null, maxBpm: 150, color: "#000000" }]),
    ).toBeNull();
  });
});

describe("profile versions and effective dates (HR-04, HR-05, AC-07)", () => {
  const v1 = defaultProfile();
  const newZones = zones.map((z) => ({ ...z }));
  newZones[0] = { ...newZones[0]!, maxBpm: 142 };
  newZones[1] = { ...newZones[1]!, minBpm: 143 };
  const v2 = createProfileVersion(v1, { id: "hp2", zones: newZones, effectiveFrom: "2025-06-01" });

  it("creates a new version without mutating the previous one", () => {
    expect(v2.version).toBe(2);
    expect(v2.athleteId).toBe(v1.athleteId);
    expect(v2.name).toBe(v1.name);
    expect(v1.zones[0]?.maxBpm).toBe(139);
    expect(v2.zones[0]?.maxBpm).toBe(142);
  });

  it("classifies historical activities with the profile valid on their date", () => {
    const profiles = [v2, v1];
    expect(profileForDate(profiles, "2025-05-31")?.id).toBe("hp1");
    expect(profileForDate(profiles, "2025-06-01")?.id).toBe("hp2");
    expect(classifyHr(141, profileForDate(profiles, "2025-05-31")!.zones)?.name).toBe("AeT");
    expect(classifyHr(141, profileForDate(profiles, "2025-06-02")!.zones)?.name).toBe("Easy");
  });

  it("uses the highest version when two versions share an effective date", () => {
    const v3 = createProfileVersion(v2, {
      id: "hp3",
      zones: zones.map((z) => ({ ...z })),
      effectiveFrom: "2025-06-01",
      name: "Renamed",
    });
    expect(v3.name).toBe("Renamed");
    expect(profileForDate([v1, v3, v2], "2025-07-01")?.id).toBe("hp3");
  });

  it("falls back to the earliest profile for dates before any profile", () => {
    expect(profileForDate([v2, v1], "2022-01-01")?.id).toBe("hp1");
    expect(profileForDate([], "2022-01-01")).toBeNull();
  });

  it("rejects invalid new versions", () => {
    expect(() =>
      createProfileVersion(v1, { id: "x", zones: [], effectiveFrom: "2025-01-01" }),
    ).toThrow(InvalidHrZoneProfileError);
    expect(() =>
      createProfileVersion(v1, { id: "x", zones: [...zones], effectiveFrom: "2025-02-30" }),
    ).toThrow(RangeError);
  });
});
