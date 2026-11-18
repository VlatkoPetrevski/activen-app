import { describe, expect, it } from "vitest";
import { activityMix, byWeekday, kpis, zoneBreakdown } from "../src/analytics.js";
import {
  classifyHr,
  createProfileVersion,
  DEFAULT_HR_ZONES,
  InvalidHrZoneProfileError,
  profileForDate,
  sameZoneBoundaries,
  validateZones,
  zonesFromLowerBounds,
} from "../src/hr-zones.js";
import { mergeActivities } from "../src/merge.js";
import { buildActivitiesReport, REPORT_COLORS } from "../src/report.js";
import { DEFAULT_SOURCE_PRIORITY } from "../src/source-policy.js";
import {
  filterActivities,
  isRun,
  matchesFilter,
  PRESET_FILTERS,
  sportCategory,
  sportKey,
} from "../src/sport.js";
import { summarize } from "../src/summaries.js";
import { activity, defaultProfile, plan } from "./fixtures.js";

describe("sport normalization and filters", () => {
  it("resolves export-style names with spaces", () => {
    expect(sportKey("Weight Training")).toBe("weighttraining");
    expect(sportCategory("Weight Training")).toBe("strength");
    expect(sportCategory("Rowing")).toBe("row");
    expect(isRun("Trail Run")).toBe(true);
  });

  it("offers presets for running with/without trail and treadmill", () => {
    const types = ["Run", "TrailRun", "VirtualRun", "Ride", "Workout"];
    const pick = (f: Parameters<typeof matchesFilter>[1]) =>
      types.filter((t) => matchesFilter(t, f));
    expect(pick(PRESET_FILTERS.all)).toEqual(types);
    expect(pick(undefined)).toEqual(types);
    expect(pick(PRESET_FILTERS.running)).toEqual(["Run", "TrailRun", "VirtualRun"]);
    expect(pick(PRESET_FILTERS.roadRunning)).toEqual(["Run"]);
    expect(pick(PRESET_FILTERS.runningWithoutTreadmill)).toEqual(["Run", "TrailRun"]);
    expect(pick(PRESET_FILTERS.runningWithoutTrail)).toEqual(["Run", "VirtualRun"]);
    expect(filterActivities([{ sportType: "Ride" }], PRESET_FILTERS.running)).toEqual([]);
  });
});

describe("HR zones from vendors and manual entry", () => {
  it("rejects names mixing Latin and Cyrillic letters (Excel 'АеТ' bug)", () => {
    const zones = DEFAULT_HR_ZONES.map((z) => ({ ...z }));
    zones[1] = { ...zones[1]!, name: "АеТ" }; // Cyrillic А, е, Т — but no Latin letter
    expect(validateZones(zones)).toEqual([]);
    zones[1] = { ...zones[1]!, name: "AeТ" }; // Latin A, e + Cyrillic Т
    expect(validateZones(zones).map((e) => e.code)).toEqual(["NAME_MIXED_SCRIPT"]);
  });

  it("builds five report-named zones from vendor lower bounds", () => {
    const zones = zonesFromLowerBounds([95, 140, 151, 166, 172]);
    expect(sameZoneBoundaries(zones, DEFAULT_HR_ZONES)).toBe(true);
    expect(zones.map((z) => z.color)).toEqual(DEFAULT_HR_ZONES.map((z) => z.color));
  });

  it("rounds fractional vendor bounds and names other zone counts Z1…Zn", () => {
    const zones = zonesFromLowerBounds([0, 120.4, 150.6]);
    expect(zones).toMatchObject([
      { name: "Z1", minBpm: null, maxBpm: 119 },
      { name: "Z2", minBpm: 120, maxBpm: 150 },
      { name: "Z3", minBpm: 151, maxBpm: null },
    ]);
    const named = zonesFromLowerBounds([0, 130], {
      names: ["Low", "High"],
      colors: ["#000000", "#FFFFFF"],
    });
    expect(named.map((z) => [z.name, z.color])).toEqual([
      ["Low", "#000000"],
      ["High", "#FFFFFF"],
    ]);
  });

  it("rejects unordered vendor bounds", () => {
    expect(() => zonesFromLowerBounds([0, 150, 140])).toThrow(InvalidHrZoneProfileError);
  });

  it("detects boundary changes, ignoring colors", () => {
    const recolored = DEFAULT_HR_ZONES.map((z) => ({ ...z, color: "#000000" }));
    expect(sameZoneBoundaries(recolored, DEFAULT_HR_ZONES)).toBe(true);
    expect(sameZoneBoundaries(recolored.slice(1), DEFAULT_HR_ZONES)).toBe(false);
    expect(
      sameZoneBoundaries(zonesFromLowerBounds([0, 141, 151, 166, 172]), DEFAULT_HR_ZONES),
    ).toBe(false);
  });

  it("uses the athlete's preferred zone source, falling back to any source", () => {
    const manual = defaultProfile();
    const garmin = {
      ...defaultProfile({ id: "g1", source: "garmin" as const, effectiveFrom: "2026-01-01" }),
      zones: zonesFromLowerBounds([0, 135, 150, 165, 175]),
    };
    expect(profileForDate([manual, garmin], "2026-06-01", ["garmin", "manual"])?.id).toBe("g1");
    expect(profileForDate([manual, garmin], "2026-06-01", ["manual"])?.id).toBe("hp1");
    expect(profileForDate([manual], "2026-06-01", ["polar"])?.id).toBe("hp1");
    expect(profileForDate([manual, garmin], "2026-06-01", [])?.id).toBe("g1");
    expect(
      classifyHr(137, profileForDate([manual, garmin], "2026-06-01", ["garmin"])!.zones)?.name,
    ).toBe("AeT");
  });

  it("keeps or changes the source when versioning", () => {
    const v1 = defaultProfile();
    const zones = DEFAULT_HR_ZONES.map((z) => ({ ...z }));
    expect(createProfileVersion(v1, { id: "v2", zones, effectiveFrom: "2026-01-01" }).source).toBe(
      "manual",
    );
    expect(
      createProfileVersion(v1, { id: "v3", zones, effectiveFrom: "2026-01-01", source: "polar" })
        .source,
    ).toBe("polar");
  });
});

describe("source priority", () => {
  it("prefers watch makers over Strava by default", () => {
    expect(DEFAULT_SOURCE_PRIORITY[0]).toBe("garmin");
    expect(DEFAULT_SOURCE_PRIORITY.at(-1)).toBe("strava");
    const strava = activity({
      localDate: "2026-11-16",
      source: { vendor: "strava", externalId: "s" },
      name: "Strava name",
    });
    const suunto = activity({
      localDate: "2026-11-16",
      source: { vendor: "suunto", externalId: "u" },
      name: "Suunto name",
    });
    expect(mergeActivities([strava, suunto])[0]?.activity.name).toBe("Suunto name");
  });
});

/**
 * Regression against the reference workbook: week 21.09.–27.09.2026 (names and gear omitted).
 * Excel weekly row: distance 36.5423 km, elevation 106 m, Relative Effort 48.25, avg HR 141,
 * avg max HR 161.75, calories 3576.
 */
describe("parity with the reference Excel week 21–27.09.2026", () => {
  const week = [
    activity({
      localDate: "2026-09-24",
      distanceM: 12_009.8,
      elapsedTimeS: 4_085,
      elevationGainM: 38,
      relativeEffort: 52,
      avgHr: 151,
      maxHr: 176,
      avgWatts: 381,
      calories: 964,
    }),
    activity({
      localDate: "2026-09-23",
      distanceM: 8_010.3,
      elapsedTimeS: 3_013,
      elevationGainM: 23,
      relativeEffort: 14,
      avgHr: 138,
      maxHr: 150,
      avgWatts: 363,
      calories: 649,
    }),
    activity({
      localDate: "2026-09-22",
      sportType: "Workout",
      distanceM: 0,
      elapsedTimeS: 5_440,
      elevationGainM: 0,
      relativeEffort: 16,
      avgHr: 116,
      maxHr: 145,
      avgWatts: null,
      calories: 651,
    }),
    activity({
      localDate: "2026-09-22",
      distanceM: 16_522.2,
      elapsedTimeS: 5_384,
      elevationGainM: 45,
      relativeEffort: 111,
      avgHr: 159,
      maxHr: 176,
      avgWatts: 442,
      calories: 1312,
    }),
  ];
  const [w] = summarize(week, "week", { hrProfiles: [defaultProfile()] });

  it("reproduces the weekly totals and averages", () => {
    expect(w?.totalDistanceM).toBeCloseTo(36_542.3, 1);
    expect(w?.elevationGainM).toBe(106);
    expect(w?.avgRelativeEffort).toBe(48.25);
    expect(w?.avgHr).toBe(141);
    expect(w?.avgMaxHr).toBe(161.75);
    expect(w?.peakMaxHr).toBe(176);
    expect(w?.totalCalories).toBe(3_576);
  });

  it("fixes the workbook's weekly pace (run time / run distance, elapsed)", () => {
    expect(w?.runPaceSPerKm).toBeCloseTo((4_085 + 3_013 + 5_384) / 36.5423, 6);
    // Excel summed power (1186 W); the meaningful value is the mean.
    expect(w?.avgWatts).toBeCloseTo(395.33, 2);
  });

  it("classifies the activities into the same zones as the workbook", () => {
    expect(w?.zoneElapsedS).toEqual({ Tempo: 4_085 + 5_384, Easy: 3_013 + 5_440 });
  });

  it("can count running only", () => {
    const [runs] = summarize(week, "week", { filter: PRESET_FILTERS.running });
    expect(runs?.activityCount).toBe(3);
    expect(runs?.avgHr).toBeCloseTo(149.33, 2);
  });
});

describe("report filter and palette", () => {
  it("hides filtered activities but never the plan, and keeps plan matching unchanged", () => {
    const ride = activity({ localDate: "2026-11-16", sportType: "Ride" });
    const treadmill = activity({ localDate: "2026-11-16", sportType: "VirtualRun" });
    const p = plan({ date: "2026-11-16", description: "8 km easy" });
    const r = buildActivitiesReport({
      activities: [ride, treadmill],
      planEntries: [p],
      hrProfiles: [defaultProfile()],
      zoneSourcePreference: ["manual"],
      today: "2026-11-18",
      filter: PRESET_FILTERS.runningWithoutTreadmill,
    });
    expect(r.rows.map((x) => x.type)).toEqual(["week_summary", "plan_only"]);
    expect(r.rows[1]).toMatchObject({
      status: "completed_hidden",
      plan: { description: "8 km easy" },
    });
    expect(r.links[0]?.activityId).toBe(treadmill.id);
    expect(r.rows[0]?.type === "week_summary" && r.rows[0].summary.activityCount).toBe(0);
  });

  it("uses the workbook colors for summary, non-run and plan-only rows", () => {
    const r = buildActivitiesReport({
      activities: [activity({ localDate: "2026-11-16", sportType: "Workout" })],
      planEntries: [plan({ date: "2026-11-17", kind: "rest" })],
      hrProfiles: [],
      today: "2026-11-18",
    });
    expect(r.rows.map((x) => [x.type, x.style.fontColor, x.style.rowFill])).toEqual([
      ["week_summary", REPORT_COLORS.summaryFont, REPORT_COLORS.summaryFill],
      ["plan_only", REPORT_COLORS.planOnlyFont, null],
      ["activity", REPORT_COLORS.nonRunFont, null],
    ]);
  });
});

describe("analytics (Analysis sheet)", () => {
  const acts = [
    activity({
      localDate: "2026-11-16",
      distanceM: 10_000,
      elapsedTimeS: 3_000,
      avgHr: 135,
      relativeEffort: 20,
      elevationGainM: 10,
    }),
    activity({
      localDate: "2026-11-17",
      sportType: "TrailRun",
      distanceM: 20_000,
      elapsedTimeS: 7_200,
      avgHr: 155,
      relativeEffort: 80,
      elevationGainM: 500,
    }),
    activity({
      localDate: "2026-11-18",
      sportType: "Workout",
      distanceM: 0,
      elapsedTimeS: 3_600,
      avgHr: null,
      relativeEffort: null,
    }),
    activity({
      localDate: "2026-11-23",
      sportType: "VirtualRun",
      distanceM: 5_000,
      elapsedTimeS: 1_500,
      avgHr: null,
      relativeEffort: null,
      elevationGainM: null,
    }),
    activity({ localDate: "2026-11-19", deleted: true }),
  ];

  it("computes running KPIs with a weighted pace", () => {
    expect(kpis(acts)).toEqual({
      count: 3,
      distanceM: 35_000,
      elapsedS: 11_700,
      paceSPerKm: 11_700 / 35,
      avgHr: 145,
      avgRelativeEffort: 50,
      elevationGainM: 510,
      longestDistanceM: 20_000,
    });
    expect(kpis(acts, { filter: PRESET_FILTERS.roadRunning }).count).toBe(1);
    expect(kpis(acts, { from: "2026-11-17", to: "2026-11-17" }).count).toBe(1);
    expect(kpis([], {})).toMatchObject({
      count: 0,
      paceSPerKm: null,
      avgHr: null,
      longestDistanceM: null,
    });
  });

  it("builds the activity mix of all activities", () => {
    const mix = activityMix(acts);
    expect(mix.map((m) => [m.sportType, m.count])).toEqual([
      ["Run", 1],
      ["TrailRun", 1],
      ["VirtualRun", 1],
      ["Workout", 1],
    ]);
    expect(mix[0]?.share).toBe(0.25);
    expect(activityMix([])).toEqual([]);
  });

  it("breaks running down by HR zone in zone order", () => {
    const z = zoneBreakdown(acts, [defaultProfile()]);
    expect(z.map((e) => [e.zone, e.count])).toEqual([
      ["Easy", 1],
      ["Tempo", 1],
      [null, 1],
    ]);
    expect(z[1]).toMatchObject({ distanceM: 20_000, avgHr: 155, avgRelativeEffort: 80 });
    expect(z[2]).toMatchObject({ avgHr: null, avgRelativeEffort: null });
    expect(zoneBreakdown(acts, []).map((e) => e.zone)).toEqual([null]);
  });

  it("distributes running by weekday", () => {
    const d = byWeekday(acts);
    expect(d[0]).toMatchObject({ day: "Monday", count: 2, distanceM: 15_000 });
    expect(d[1]?.share).toBeCloseTo(20 / 35, 6);
    expect(byWeekday([]).every((x) => x.share === 0)).toBe(true);
  });
});
