import { describe, expect, it } from "vitest";
import { activityMix, byWeekday, kpis, zoneBreakdown } from "../src/analytics.js";
import {
  classifyHr,
  createProfileVersion,
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
  isRunning,
  matchesFilter,
  PRESET_FILTERS,
  activityGroup,
  activityTypeKey,
} from "../src/sport.js";
import { summarize } from "../src/summaries.js";
import { activity, defaultProfile, MANUAL_ZONES, plan } from "./fixtures.js";

describe("activity types and filters (Garmin activityType)", () => {
  it("resolves types tolerant of case, spaces and hyphens", () => {
    expect(activityTypeKey("strength training")).toBe("STRENGTH_TRAINING");
    expect(activityGroup("Strength Training")).toBe("gym");
    expect(activityGroup("indoor-rowing")).toBe("rowing");
    expect(activityGroup("Kitesurfing")).toBe("other");
    expect(isRunning("trail running")).toBe(true);
    expect(isRunning("TREADMILL_RUNNING")).toBe(true);
  });

  it("offers presets for running with/without trail and treadmill", () => {
    const types = ["RUNNING", "TRAIL_RUNNING", "VIRTUAL_RUN", "CYCLING", "INDOOR_CARDIO"];
    const pick = (f: Parameters<typeof matchesFilter>[1]) =>
      types.filter((t) => matchesFilter(t, f));
    expect(pick(PRESET_FILTERS.all)).toEqual(types);
    expect(pick(undefined)).toEqual(types);
    expect(pick(PRESET_FILTERS.running)).toEqual(["RUNNING", "TRAIL_RUNNING", "VIRTUAL_RUN"]);
    expect(pick(PRESET_FILTERS.roadRunning)).toEqual(["RUNNING"]);
    expect(pick(PRESET_FILTERS.runningWithoutTreadmill)).toEqual(["RUNNING", "TRAIL_RUNNING"]);
    expect(pick(PRESET_FILTERS.runningWithoutTrail)).toEqual(["RUNNING", "VIRTUAL_RUN"]);
    expect(filterActivities([{ activityType: "CYCLING" }], PRESET_FILTERS.running)).toEqual([]);
  });
});

describe("HR zones from vendors and manual entry", () => {
  it("rejects names mixing Latin and Cyrillic letters (Excel 'АеТ' bug)", () => {
    const zones = MANUAL_ZONES.map((z) => ({ ...z }));
    zones[1] = { ...zones[1]!, name: "АеТ" }; // Cyrillic А, е, Т — but no Latin letter
    expect(validateZones(zones)).toEqual([]);
    zones[1] = { ...zones[1]!, name: "AeТ" }; // Latin A, e + Cyrillic Т
    expect(validateZones(zones).map((e) => e.code)).toEqual(["NAME_MIXED_SCRIPT"]);
  });

  it("names five vendor zones like Garmin and keeps boundaries", () => {
    const zones = zonesFromLowerBounds([95, 140, 151, 166, 172]);
    expect(zones.map((z) => z.name)).toEqual([
      "Warm Up",
      "Easy",
      "Aerobic",
      "Threshold",
      "Maximum",
    ]);
    const renamed = zonesFromLowerBounds([95, 140, 151, 166, 172], {
      names: MANUAL_ZONES.map((z) => z.name),
    });
    expect(sameZoneBoundaries(renamed, MANUAL_ZONES)).toBe(true);
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
    const recolored = MANUAL_ZONES.map((z) => ({ ...z, color: "#000000" }));
    expect(sameZoneBoundaries(recolored, MANUAL_ZONES)).toBe(true);
    expect(sameZoneBoundaries(recolored.slice(1), MANUAL_ZONES)).toBe(false);
    expect(
      sameZoneBoundaries(
        zonesFromLowerBounds([0, 141, 151, 166, 172], { names: MANUAL_ZONES.map((z) => z.name) }),
        MANUAL_ZONES,
      ),
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
    ).toBe("Easy");
  });

  it("keeps or changes the source when versioning", () => {
    const v1 = defaultProfile();
    const zones = MANUAL_ZONES.map((z) => ({ ...z }));
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
      calendarDate: "2026-11-16",
      source: { vendor: "strava", externalId: "s" },
      activityName: "Strava name",
    });
    const suunto = activity({
      calendarDate: "2026-11-16",
      source: { vendor: "suunto", externalId: "u" },
      activityName: "Suunto name",
    });
    expect(mergeActivities([strava, suunto])[0]?.activity.activityName).toBe("Suunto name");
  });
});

/**
 * Regression against the reference workbook: week 21.09.–27.09.2026 (names and gear omitted).
 * Excel weekly row: distance 36.5423 km, elevation 106 m, Relative Effort 48.25, avg HR 141,
 * avg max HR 161.75, activeKilocalories 3576.
 */
describe("parity with the reference Excel week 21–27.09.2026", () => {
  const week = [
    activity({
      calendarDate: "2026-09-24",
      distanceInMeters: 12_009.8,
      durationInSeconds: 4_085,
      totalElevationGainInMeters: 38,
      trainingLoad: 52,
      averageHeartRateInBeatsPerMinute: 151,
      maxHeartRateInBeatsPerMinute: 176,
      averagePowerInWatts: 381,
      activeKilocalories: 964,
    }),
    activity({
      calendarDate: "2026-09-23",
      distanceInMeters: 8_010.3,
      durationInSeconds: 3_013,
      totalElevationGainInMeters: 23,
      trainingLoad: 14,
      averageHeartRateInBeatsPerMinute: 138,
      maxHeartRateInBeatsPerMinute: 150,
      averagePowerInWatts: 363,
      activeKilocalories: 649,
    }),
    activity({
      calendarDate: "2026-09-22",
      activityType: "INDOOR_CARDIO",
      distanceInMeters: 0,
      durationInSeconds: 5_440,
      totalElevationGainInMeters: 0,
      trainingLoad: 16,
      averageHeartRateInBeatsPerMinute: 116,
      maxHeartRateInBeatsPerMinute: 145,
      averagePowerInWatts: null,
      activeKilocalories: 651,
    }),
    activity({
      calendarDate: "2026-09-22",
      distanceInMeters: 16_522.2,
      durationInSeconds: 5_384,
      totalElevationGainInMeters: 45,
      trainingLoad: 111,
      averageHeartRateInBeatsPerMinute: 159,
      maxHeartRateInBeatsPerMinute: 176,
      averagePowerInWatts: 442,
      activeKilocalories: 1312,
    }),
  ];
  const [w] = summarize(week, "week", { hrProfiles: [defaultProfile()] });

  it("reproduces the weekly totals and averages", () => {
    expect(w?.distanceInMeters).toBeCloseTo(36_542.3, 1);
    expect(w?.totalElevationGainInMeters).toBe(106);
    expect(w?.averageTrainingLoad).toBe(48.25);
    expect(w?.totalTrainingLoad).toBe(193);
    expect(w?.averageHeartRateInBeatsPerMinute).toBe(141);
    expect(w?.averageMaxHeartRateInBeatsPerMinute).toBe(161.75);
    expect(w?.maxHeartRateInBeatsPerMinute).toBe(176);
    expect(w?.activeKilocalories).toBe(3_576);
  });

  it("fixes the workbook's weekly pace (run time / run distance, elapsed)", () => {
    expect(w?.runningPaceInSecondsPerKilometer).toBeCloseTo((4_085 + 3_013 + 5_384) / 36.5423, 6);
    // Excel summed power (1186 W); the meaningful value is the mean.
    expect(w?.averagePowerInWatts).toBeCloseTo(395.33, 2);
  });

  it("classifies the activities into the same zones as the workbook", () => {
    expect(w?.timeInHeartRateZonesInSeconds).toEqual({ Tempo: 4_085 + 5_384, Easy: 3_013 + 5_440 });
  });

  it("can count running only", () => {
    const [runs] = summarize(week, "week", { filter: PRESET_FILTERS.running });
    expect(runs?.activityCount).toBe(3);
    expect(runs?.averageHeartRateInBeatsPerMinute).toBeCloseTo(149.33, 2);
  });
});

describe("report filter and palette", () => {
  it("hides filtered activities but never the plan, and keeps plan matching unchanged", () => {
    const ride = activity({ calendarDate: "2026-11-16", activityType: "CYCLING" });
    const treadmill = activity({ calendarDate: "2026-11-16", activityType: "VIRTUAL_RUN" });
    const p = plan({ calendarDate: "2026-11-16", description: "8 km easy" });
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
      activities: [activity({ calendarDate: "2026-11-16", activityType: "INDOOR_CARDIO" })],
      planEntries: [plan({ calendarDate: "2026-11-17", kind: "rest" })],
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
      calendarDate: "2026-11-16",
      distanceInMeters: 10_000,
      durationInSeconds: 3_000,
      averageHeartRateInBeatsPerMinute: 135,
      trainingLoad: 20,
      totalElevationGainInMeters: 10,
    }),
    activity({
      calendarDate: "2026-11-17",
      activityType: "TRAIL_RUNNING",
      distanceInMeters: 20_000,
      durationInSeconds: 7_200,
      averageHeartRateInBeatsPerMinute: 155,
      trainingLoad: 80,
      totalElevationGainInMeters: 500,
    }),
    activity({
      calendarDate: "2026-11-18",
      activityType: "INDOOR_CARDIO",
      distanceInMeters: 0,
      durationInSeconds: 3_600,
      averageHeartRateInBeatsPerMinute: null,
      trainingLoad: null,
    }),
    activity({
      calendarDate: "2026-11-23",
      activityType: "VIRTUAL_RUN",
      distanceInMeters: 5_000,
      durationInSeconds: 1_500,
      averageHeartRateInBeatsPerMinute: null,
      trainingLoad: null,
      totalElevationGainInMeters: null,
    }),
    activity({ calendarDate: "2026-11-19", deleted: true }),
  ];

  it("computes running KPIs with a weighted pace", () => {
    expect(kpis(acts)).toEqual({
      count: 3,
      distanceInMeters: 35_000,
      durationInSeconds: 11_700,
      paceInSecondsPerKilometer: 11_700 / 35,
      averageHeartRateInBeatsPerMinute: 145,
      averageTrainingLoad: 50,
      totalElevationGainInMeters: 510,
      longestDistanceInMeters: 20_000,
    });
    expect(kpis(acts, { filter: PRESET_FILTERS.roadRunning }).count).toBe(1);
    expect(kpis(acts, { from: "2026-11-17", to: "2026-11-17" }).count).toBe(1);
    expect(kpis([], {})).toMatchObject({
      count: 0,
      paceInSecondsPerKilometer: null,
      averageHeartRateInBeatsPerMinute: null,
      longestDistanceInMeters: null,
    });
  });

  it("builds the activity mix of all activities", () => {
    const mix = activityMix(acts);
    expect(mix.map((m) => [m.activityType, m.count])).toEqual([
      ["INDOOR_CARDIO", 1],
      ["RUNNING", 1],
      ["TRAIL_RUNNING", 1],
      ["VIRTUAL_RUN", 1],
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
    expect(z[1]).toMatchObject({
      distanceInMeters: 20_000,
      averageHeartRateInBeatsPerMinute: 155,
      averageTrainingLoad: 80,
    });
    expect(z[2]).toMatchObject({
      averageHeartRateInBeatsPerMinute: null,
      averageTrainingLoad: null,
    });
    expect(zoneBreakdown(acts, []).map((e) => e.zone)).toEqual([null]);
  });

  it("distributes running by weekday", () => {
    const d = byWeekday(acts);
    expect(d[0]).toMatchObject({ day: "Monday", count: 2, distanceInMeters: 15_000 });
    expect(d[1]?.share).toBeCloseTo(20 / 35, 6);
    expect(byWeekday([]).every((x) => x.share === 0)).toBe(true);
  });
});
