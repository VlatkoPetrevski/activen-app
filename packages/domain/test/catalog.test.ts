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
import { normalizeVendorSport } from "../src/catalog/sports.js";
import { ACTIVITY_TYPES } from "../src/activity-types.js";
import { applyTransform, isoDurationToSeconds } from "../src/catalog/transforms.js";
import { activityGroup } from "../src/sport.js";

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
      "activities.startTimeInSeconds",
      "activities.activityType",
      "activities.durationInSeconds",
      "activities.distanceInMeters",
      "activities.averageHeartRateInBeatsPerMinute",
      "activities.maxHeartRateInBeatsPerMinute",
      "activities.activeKilocalories",
    ]) {
      const f = catalogField(key);
      for (const v of CATALOG_VENDORS) expect(f?.mappings[v], `${key} / ${v}`).toBeDefined();
    }
  });

  it("keeps proprietary metrics separate from common ones", () => {
    expect(catalogField("stress_details.timeOffsetBodyBatteryValues")?.origin).toBe("garmin");
    expect(catalogField("hrv.polarNightlyRechargeStatus")?.origin).toBe("polar");
    expect(catalogField("activities.suuntoPeakEpoc")?.origin).toBe("suunto");
    expect(catalogField("user_metrics.corosRunningFitness")?.origin).toBe("coros");
    expect(catalogField("hrv.lastNightAvg")?.origin).toBe("common");
    expect(catalogField("nope")).toBeUndefined();
  });

  it("treats activity data as standard and health data as sensitive", () => {
    expect(catalogField("activities.distanceInMeters")?.sensitivity).toBe("standard");
    expect(catalogField("activity_samples.heartRate")?.sensitivity).toBe("standard");
    expect(catalogField("activities.startingLatitudeInDegree")?.sensitivity).toBe("health");
    expect(catalogField("hrv.lastNightAvg")?.sensitivity).toBe("health");
    expect(catalogField("blood_pressure.reading")?.sensitivity).toBe("special");
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
        domain: "dailies",
        unit: "s",
        label: "A",
        origin: "common",
        sensitivity: "health",
        mappings: {},
      },
      {
        key: "x.a",
        domain: "dailies",
        unit: "s",
        label: " ",
        origin: "activen",
        sensitivity: "health",
        mappings: { garmin: { path: "", transform: "none", status: "documented" } },
      },
      {
        key: "Bad",
        domain: "dailies",
        unit: "s",
        label: "B",
        origin: "polar",
        sensitivity: "health",
        mappings: { garmin: { path: "p", transform: "nope" as never, status: "documented" } },
      },
      {
        key: "x.c",
        domain: "dailies",
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
      "key must be <summary_type>.<camelCaseField>",
      "unknown transform",
      "proprietary polar field mapped from another vendor",
      "proprietary field without its vendor",
      "unknown vendor fitbit",
    ])
      expect(errors).toContain(expected);
  });
});

describe("activity type normalization (→ Garmin activityType)", () => {
  it.each([
    ["garmin", "RUNNING", null, "RUNNING"],
    ["garmin", "TRAIL_RUNNING", null, "TRAIL_RUNNING"],
    ["garmin", "treadmill_running", null, "TREADMILL_RUNNING"],
    ["garmin", "INDOOR_RUNNING", null, "TREADMILL_RUNNING"],
    ["garmin", "STREET_RUNNING", null, "RUNNING"],
    ["garmin", "FLOOR_CLIMBING", null, "STAIR_CLIMBING"],
    ["garmin", "MOUNTAINEERING", null, "HIKING"],
    ["garmin", "BMX", null, "OTHER"],
    ["polar", "RUNNING", "TRAIL_RUNNING", "TRAIL_RUNNING"],
    ["polar", "RUNNING", "TREADMILL_RUNNING", "TREADMILL_RUNNING"],
    ["polar", "RUNNING", "ROAD_RUNNING", "RUNNING"],
    ["polar", "CYCLING", "ROAD_BIKING", "ROAD_BIKING"],
    ["polar", "OTHER", "CROSSFIT", "HIIT"],
    ["polar", "SWIMMING", "POOL_SWIMMING", "LAP_SWIMMING"],
    ["polar", "SWIMMING", "OPEN_WATER_SWIMMING", "OPEN_WATER_SWIMMING"],
    ["suunto", "running", "trail", "TRAIL_RUNNING"],
    ["suunto", "running", "track", "TRACK_RUNNING"],
    ["suunto", "running", "generic", "RUNNING"],
    ["suunto", "running", "street", "RUNNING"],
    ["suunto", "running", "virtual_activity", "VIRTUAL_RUN"],
    ["suunto", "hiking", null, "HIKING"],
    ["suunto", "walking", null, "WALKING"],
    ["suunto", "multisport", null, "MULTI_SPORT"],
    ["suunto", "cross_country_skiing", null, "CROSS_COUNTRY_SKIING_WS"],
    ["suunto", "alpine_skiing", null, "RESORT_SKIING_SNOWBOARDING_WS"],
    ["coros", "fitness_equipment", "treadmill", "TREADMILL_RUNNING"],
    ["coros", "fitness_equipment", "indoor_rowing", "INDOOR_ROWING"],
    ["coros", "fitness_equipment", "elliptical", "ELLIPTICAL"],
    ["coros", "fitness_equipment", "stair_climbing", "STAIR_CLIMBING"],
    ["coros", "training", "strength_training", "STRENGTH_TRAINING"],
    ["coros", "training", "cardio_training", "INDOOR_CARDIO"],
    ["coros", "training", "yoga", "YOGA"],
    ["coros", "training", "pilates", "PILATES"],
    ["coros", "cycling", "indoor_cycling", "INDOOR_CYCLING"],
    ["coros", "cycling", "virtual_activity", "VIRTUAL_RIDE"],
    ["coros", "cycling", "road", "ROAD_BIKING"],
    ["coros", "cycling", "mountain", "MOUNTAIN_BIKING"],
    ["coros", "cycling", "gravel_cycling", "GRAVEL_CYCLING"],
    ["coros", "cycling", null, "CYCLING"],
    ["coros", "e_biking", null, "E_BIKE_FITNESS"],
    ["coros", "rowing", null, "ROWING"],
    ["coros", "swimming", "lap_swimming", "LAP_SWIMMING"],
    ["coros", "swimming", "open_water", "OPEN_WATER_SWIMMING"],
    ["coros", "hiit", null, "HIIT"],
    ["coros", "kitesurfing", null, "OTHER"],
  ] as const)("%s %s/%s → %s", (vendor, sport, sub, expected) => {
    expect(normalizeVendorSport(vendor, sport, sub)).toBe(expected);
  });

  it("assigns every activity type to a group; all run variants are running", () => {
    for (const a of ACTIVITY_TYPES) expect(activityGroup(a)).toBeTruthy();
    for (const a of [
      "RUNNING",
      "TRAIL_RUNNING",
      "TREADMILL_RUNNING",
      "TRACK_RUNNING",
      "VIRTUAL_RUN",
    ])
      expect(activityGroup(a)).toBe("running");
    expect(activityGroup("OTHER")).toBe("other");
  });
});

describe("transforms", () => {
  it("converts units", () => {
    expect(applyTransform("g_to_kg", 72_500)).toBe(72.5);
    expect(applyTransform("kg_to_g", 72.5)).toBe(72_500);
    expect(applyTransform("iso_to_epoch_s", "2016-01-11T00:00:00Z")).toBe(1_452_470_400);
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
    expect(() => applyTransform("iso_to_epoch_s", 5)).toThrow(TypeError);
    expect(() => applyTransform("iso_to_epoch_s", "not a date")).toThrow(RangeError);
  });

  it("parses ISO-8601 durations", () => {
    expect(isoDurationToSeconds("PT45M")).toBe(2700);
    expect(isoDurationToSeconds("P1DT1S")).toBe(86_401);
    expect(isoDurationToSeconds("PT8H")).toBe(28_800);
    for (const bad of ["P", "PT", "1H", "PT1X"])
      expect(() => isoDurationToSeconds(bad)).toThrow(RangeError);
  });
});
