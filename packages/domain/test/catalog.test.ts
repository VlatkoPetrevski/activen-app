import { describe, expect, it } from "vitest";
import {
  CATALOG,
  CATALOG_VENDORS,
  catalogField,
  DOMAINS,
  fieldsByDomain,
  UNITS,
  validateCatalog,
  vendorCoverage,
  type CatalogField,
} from "../src/catalog/index.js";
import { CANONICAL_SPORTS, normalizeVendorSport } from "../src/catalog/sports.js";
import { applyTransform, isoDurationToSeconds } from "../src/catalog/transforms.js";
import { sportCategory } from "../src/sport.js";

describe("catalog structure", () => {
  it("is internally consistent", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("uses only known domains and units", () => {
    for (const f of CATALOG) {
      expect(DOMAINS).toContain(f.domain);
      expect(UNITS).toContain(f.unit);
    }
  });

  it("covers every domain", () => {
    for (const d of DOMAINS) expect(fieldsByDomain(d).length).toBeGreaterThan(0);
  });

  it("maps the core activity metrics for all four vendors", () => {
    for (const key of [
      "activity.start_time",
      "activity.sport",
      "activity.elapsed_time_s",
      "activity.distance_m",
      "activity.avg_hr",
      "activity.max_hr",
      "activity.calories_kcal",
    ]) {
      const f = catalogField(key);
      for (const v of CATALOG_VENDORS) expect(f?.mappings[v], `${key} / ${v}`).toBeDefined();
    }
  });

  it("keeps proprietary metrics separate from common ones", () => {
    expect(catalogField("recovery.garmin_body_battery")?.origin).toBe("garmin");
    expect(catalogField("recovery.polar_nightly_recharge")?.origin).toBe("polar");
    expect(catalogField("activity.suunto_peak_epoc")?.origin).toBe("suunto");
    expect(catalogField("fitness.coros_running_fitness")?.origin).toBe("coros");
    expect(catalogField("recovery.hrv_rmssd_ms")?.origin).toBe("common");
    expect(catalogField("nope")).toBeUndefined();
  });

  it("reports vendor coverage", () => {
    for (const v of CATALOG_VENDORS) {
      const c = vendorCoverage(v);
      expect(c.documented + c.fitProfile + c.toConfirm).toBeGreaterThan(10);
    }
    expect(vendorCoverage("garmin").documented).toBeGreaterThan(vendorCoverage("coros").documented);
  });

  it("detects structural errors", () => {
    const bad: CatalogField[] = [
      {
        key: "x.a",
        domain: "daily",
        unit: "s",
        label: "A",
        origin: "common",
        sensitivity: "health",
        mappings: {},
      },
      {
        key: "x.a",
        domain: "daily",
        unit: "s",
        label: " ",
        origin: "activen",
        sensitivity: "health",
        mappings: { garmin: { path: "", transform: "none", status: "documented" } },
      },
      {
        key: "Bad",
        domain: "daily",
        unit: "s",
        label: "B",
        origin: "polar",
        sensitivity: "health",
        mappings: { garmin: { path: "p", transform: "nope" as never, status: "documented" } },
      },
      {
        key: "x.c",
        domain: "daily",
        unit: "s",
        label: "C",
        origin: "common",
        sensitivity: "health",
        mappings: { fitbit: { path: "p", transform: "none", status: "documented" } } as never,
      },
    ];
    const errors = validateCatalog(bad).join("\n");
    for (const expected of [
      "common field without any vendor mapping",
      "duplicate key",
      "label required",
      "empty path",
      "ActiveN-computed field must not map vendors",
      "dotted snake_case",
      "unknown transform",
      "proprietary polar field mapped from another vendor",
      "proprietary field without its vendor",
      "unknown vendor fitbit",
    ])
      expect(errors).toContain(expected);
  });
});

describe("sport normalization", () => {
  it.each([
    ["garmin", "RUNNING", null, "Run"],
    ["garmin", "TRAIL_RUNNING", null, "TrailRun"],
    ["garmin", "TREADMILL_RUNNING", null, "TreadmillRun"],
    ["garmin", "INDOOR_RUNNING", null, "TreadmillRun"],
    ["garmin", "TRACK_RUNNING", null, "TrackRun"],
    ["garmin", "VIRTUAL_RUN", null, "VirtualRun"],
    ["garmin", "MOUNTAIN_BIKING", null, "MountainBikeRide"],
    ["garmin", "GRAVEL_CYCLING", null, "GravelRide"],
    ["garmin", "INDOOR_CYCLING", null, "VirtualRide"],
    ["garmin", "ROAD_BIKING", null, "Ride"],
    ["garmin", "LAP_SWIMMING", null, "Swim"],
    ["garmin", "OPEN_WATER_SWIMMING", null, "OpenWaterSwim"],
    ["garmin", "STRENGTH_TRAINING", null, "WeightTraining"],
    ["garmin", "INDOOR_CARDIO", null, "Workout"],
    ["garmin", "HIIT", null, "Workout"],
    ["garmin", "INDOOR_ROWING", null, "IndoorRowing"],
    ["garmin", "ROWING", null, "Rowing"],
    ["garmin", "ELLIPTICAL", null, "Elliptical"],
    ["garmin", "FLOOR_CLIMBING", null, "StairStepper"],
    ["garmin", "CROSS_COUNTRY_SKIING_WS", null, "NordicSki"],
    ["garmin", "RESORT_SKIING_SNOWBOARDING_WS", null, "AlpineSki"],
    ["garmin", "MULTI_SPORT", null, "Multisport"],
    ["garmin", "MOUNTAINEERING", null, "Hike"],
    ["garmin", "HIKING", null, "Hike"],
    ["garmin", "WALKING", null, "Walk"],
    ["garmin", "YOGA", null, "Yoga"],
    ["garmin", "PILATES", null, "Pilates"],
    ["garmin", "E_BIKE_FITNESS", null, "EBikeRide"],
    ["polar", "RUNNING", "TRAIL_RUNNING", "TrailRun"],
    ["polar", "RUNNING", "TREADMILL_RUNNING", "TreadmillRun"],
    ["polar", "RUNNING", "ROAD_RUNNING", "Run"],
    ["polar", "OTHER", "CROSSFIT", "Crossfit"],
    ["suunto", "running", "trail", "TrailRun"],
    ["suunto", "running", "generic", "Run"],
    ["suunto", "running", "street", "Run"],
    ["coros", "fitness_equipment", "treadmill", "TreadmillRun"],
    ["coros", "fitness_equipment", "indoor_rowing", "IndoorRowing"],
    ["coros", "fitness_equipment", "elliptical", "Elliptical"],
    ["coros", "training", "strength_training", "WeightTraining"],
    ["coros", "cycling", "indoor_cycling", "VirtualRide"],
    ["coros", "cycling", "mountain", "MountainBikeRide"],
    ["coros", "e_biking", null, "EBikeRide"],
    ["coros", "bmx", null, "Other"],
  ] as const)("%s %s/%s → %s", (vendor, sport, sub, expected) => {
    expect(normalizeVendorSport(vendor, sport, sub)).toBe(expected);
  });

  it("puts every canonical sport into a category, all run variants into 'run'", () => {
    for (const s of ["Run", "TrailRun", "TreadmillRun", "TrackRun", "VirtualRun"])
      expect(sportCategory(s)).toBe("run");
    expect(CANONICAL_SPORTS).toContain("Other");
  });
});

describe("transforms", () => {
  it("converts units", () => {
    expect(applyTransform("g_to_kg", 72_500)).toBe(72.5);
    expect(applyTransform("kmh_to_ms", 36)).toBe(10);
    expect(applyTransform("min_per_km_to_s_per_km", 5.5)).toBe(330);
    expect(applyTransform("ms_to_s", 1500)).toBe(1.5);
    expect(applyTransform("fraction_to_pct", 0.25)).toBe(25);
    expect(applyTransform("none", "x")).toBe("x");
    expect(applyTransform("epoch_s_to_iso", 1_452_470_400)).toBe("2016-01-11T00:00:00.000Z");
    expect(applyTransform("iso_duration_to_s", "PT1H2M3.5S")).toBe(3723.5);
  });

  it("keeps missing values missing and rejects wrong types", () => {
    expect(applyTransform("g_to_kg", null)).toBeNull();
    expect(applyTransform("g_to_kg", undefined)).toBeNull();
    expect(() => applyTransform("g_to_kg", "72")).toThrow(TypeError);
    expect(() => applyTransform("kmh_to_ms", Number.NaN)).toThrow(TypeError);
    expect(() => applyTransform("iso_duration_to_s", 5)).toThrow(TypeError);
  });

  it("parses ISO-8601 durations", () => {
    expect(isoDurationToSeconds("PT45M")).toBe(2700);
    expect(isoDurationToSeconds("P1DT1S")).toBe(86_401);
    expect(isoDurationToSeconds("PT8H")).toBe(28_800);
    for (const bad of ["P", "PT", "1H", "PT1X"])
      expect(() => isoDurationToSeconds(bad)).toThrow(RangeError);
  });
});
