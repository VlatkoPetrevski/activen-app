import { describe, expect, it } from "vitest";
import { buildActivitiesReport, REPORT_COLORS } from "../src/report.js";
import { emptySummary, summarize, UNCLASSIFIED_ZONE } from "../src/summaries.js";
import { activity, defaultProfile, plan, t } from "./fixtures.js";

describe("summarize (spec §10, AC-08)", () => {
  const acts = [
    // Week of 2026-11-09
    activity({
      calendarDate: "2026-11-09",
      distanceInMeters: 10_000,
      durationInSeconds: 3_000,
      averageHeartRateInBeatsPerMinute: 140,
      trainingLoad: 30,
    }),
    activity({
      calendarDate: "2026-11-15",
      distanceInMeters: 5_000,
      durationInSeconds: 1_800,
      averageHeartRateInBeatsPerMinute: 160,
      trainingLoad: null,
    }),
    activity({
      calendarDate: "2026-11-14",
      activityType: "CYCLING",
      distanceInMeters: 40_000,
      durationInSeconds: 5_400,
      averageHeartRateInBeatsPerMinute: null,
      trainingLoad: 50,
      totalElevationGainInMeters: 300,
    }),
    // Week of 2026-11-16
    activity({
      calendarDate: "2026-11-16",
      distanceInMeters: 8_000,
      durationInSeconds: 2_400,
      movingDurationInSeconds: null,
    }),
    activity({ calendarDate: "2026-11-17", deleted: true }),
  ];

  it("groups Monday–Sunday, newest week first, excluding deleted activities", () => {
    const weeks = summarize(acts, "week");
    expect(weeks.map((w) => w.key)).toEqual(["2026-11-16", "2026-11-09"]);
    expect(weeks[1]).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-15",
      activityCount: 3,
      runningActivityCount: 2,
    });
    expect(weeks[0]?.activityCount).toBe(1);
  });

  it("sums distance/time and weights running pace by total run time / total run distance", () => {
    const w = summarize(acts, "week")[1]!;
    expect(w.distanceInMeters).toBe(55_000);
    expect(w.runningDistanceInMeters).toBe(15_000);
    expect(w.durationInSeconds).toBe(10_200);
    expect(w.runningDurationInSeconds).toBe(4_800);
    expect(w.totalElevationGainInMeters).toBe(400);
    // (3000 + 1800) s / 15 km = 320 s/km — not the mean of the two paces (300 and 360 → 330).
    expect(w.runningPaceInSecondsPerKilometer).toBe(320);
  });

  it("averages HR and Relative Effort over available values only", () => {
    const w = summarize(acts, "week")[1]!;
    expect(w.averageHeartRateInBeatsPerMinute).toBe(150);
    expect(w.averageTrainingLoad).toBe(40);
  });

  it("supports moving-time pace, falling back to elapsed when moving time is missing", () => {
    const w = summarize(acts, "week", { paceBasis: "moving" });
    expect(w[1]?.runningPaceInSecondsPerKilometer).toBeCloseTo((2_900 + 2_900) / 15, 6);
    expect(w[0]?.runningPaceInSecondsPerKilometer).toBe(300);
  });

  it("produces month and year summaries with calendar ranges", () => {
    const months = summarize(
      [activity({ calendarDate: "2024-02-10" }), activity({ calendarDate: "2024-03-01" })],
      "month",
    );
    expect(months.map((m) => [m.key, m.from, m.to])).toEqual([
      ["2024-03", "2024-03-01", "2024-03-31"],
      ["2024-02", "2024-02-01", "2024-02-29"],
    ]);
    const years = summarize(acts, "year");
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({
      key: "2026",
      from: "2026-01-01",
      to: "2026-12-31",
      activityCount: 4,
    });
  });

  it("reports elapsed time per HR zone when profiles are provided", () => {
    const w = summarize(acts, "week", { hrProfiles: [defaultProfile()] })[1]!;
    expect(w.timeInHeartRateZonesInSeconds).toEqual({
      AeT: 3_000,
      Tempo: 1_800,
      [UNCLASSIFIED_ZONE]: 5_400,
    });
    expect(summarize(acts, "week")[1]?.timeInHeartRateZonesInSeconds).toBeNull();
  });

  it("handles weeks without running distance or HR", () => {
    const w = summarize(
      [
        activity({
          calendarDate: "2026-11-16",
          activityType: "STRENGTH_TRAINING",
          distanceInMeters: null,
          averageHeartRateInBeatsPerMinute: null,
          trainingLoad: null,
        }),
      ],
      "week",
    )[0]!;
    expect(w.runningPaceInSecondsPerKilometer).toBeNull();
    expect(w.averageHeartRateInBeatsPerMinute).toBeNull();
    expect(w.averageTrainingLoad).toBeNull();
    expect(emptySummary("2026-11-16", "week")).toMatchObject({
      to: "2026-11-22",
      activityCount: 0,
      timeInHeartRateZonesInSeconds: null,
    });
  });
});

describe("buildActivitiesReport (spec §5, §11, AC-04, AC-06, AC-09)", () => {
  const profile = defaultProfile();
  const longRun = activity({
    calendarDate: "2026-11-16",
    activityName: "Morning Run",
    distanceInMeters: 12_000,
    averageHeartRateInBeatsPerMinute: 155,
    startTimeInSeconds: t("2026-11-16T06:00:00Z"),
  });
  const shortRun = activity({
    calendarDate: "2026-11-16",
    activityName: "Shakeout",
    distanceInMeters: 3_000,
    averageHeartRateInBeatsPerMinute: null,
    startTimeInSeconds: t("2026-11-16T17:00:00Z"),
  });
  const ride = activity({
    calendarDate: "2026-11-15",
    activityName: "Gravel loop",
    activityType: "CYCLING",
    averageHeartRateInBeatsPerMinute: 130,
  });
  const race = activity({
    calendarDate: "2026-11-08",
    activityName: "City 10K",
    isRace: true,
    averageHeartRateInBeatsPerMinute: 175,
  });
  const p16 = plan({ calendarDate: "2026-11-16", description: "10 km tempo" });
  const p15 = plan({ calendarDate: "2026-11-15", description: "Easy run 8 km" });
  const rest = plan({ calendarDate: "2026-11-17", kind: "rest", description: "Rest" });
  const future = plan({ calendarDate: "2026-11-20", description: "Intervals 6×800" });

  const report = buildActivitiesReport({
    activities: [ride, longRun, race, shortRun],
    planEntries: [p16, p15, rest, future],
    hrProfiles: [profile],
    today: "2026-11-18",
  });
  const rows = report.rows;

  it("orders newest first with a weekly summary row above each Monday–Sunday block", () => {
    expect(
      rows.map((r) => (r.type === "week_summary" ? `W:${r.summary.key}` : r.calendarDate)),
    ).toEqual([
      "W:2026-11-16",
      "2026-11-20",
      "2026-11-17",
      "2026-11-16",
      "2026-11-16",
      "W:2026-11-09",
      "2026-11-15",
      "2026-11-15",
      "W:2026-11-02",
      "2026-11-08",
    ]);
    const summaryRow = rows[0];
    expect(summaryRow?.style.rowFill).toBe(REPORT_COLORS.summaryFill);
  });

  it("shows plan text on the matched Run and keeps Strava names untouched (AC-06)", () => {
    const longRow = rows.find((r) => r.type === "activity" && r.activity.id === longRun.id);
    const shortRow = rows.find((r) => r.type === "activity" && r.activity.id === shortRun.id);
    expect(longRow?.type === "activity" && longRow.plan?.description).toBe("10 km tempo");
    expect(longRow?.type === "activity" && longRow.activity.activityName).toBe("Morning Run");
    expect(shortRow?.type === "activity" && shortRow.plan).toBeNull();
  });

  it("keeps future plans and unmatched past plans visible without fake activities (AC-04)", () => {
    const planOnly = rows.filter((r) => r.type === "plan_only");
    expect(planOnly.map((r) => r.type === "plan_only" && [r.calendarDate, r.status])).toEqual([
      ["2026-11-20", "upcoming"],
      ["2026-11-17", "rest"],
      ["2026-11-15", "missed"], // only a Ride happened, the planned run was not done
    ]);
  });

  it("applies zone colors, race and non-Run styling; rest rows get no zone (AC-09)", () => {
    const get = (id: string) => rows.find((r) => r.type === "activity" && r.activity.id === id)!;
    expect(get(longRun.id).style.zoneFill).toBe("#A9D18E"); // Tempo
    expect(get(shortRun.id).style.zoneFill).toBeNull(); // no HR → blank zone
    expect(get(ride.id).style).toMatchObject({ muted: true, bold: false });
    expect(get(race.id).style).toMatchObject({
      bold: true,
      rowFill: REPORT_COLORS.raceFill,
      zoneFill: "#F4CCCC",
    });
    const restRow = rows.find((r) => r.type === "plan_only" && r.status === "rest")!;
    expect(restRow.style.zoneFill).toBeNull();
  });

  it("builds an empty summary for weeks with plans only and yearly summaries", () => {
    const r = buildActivitiesReport({
      activities: [],
      planEntries: [
        plan({ calendarDate: "2026-12-01" }),
        plan({ calendarDate: "2026-12-01", sequence: 1, kind: "rest" }),
      ],
      overrides: [],
      hrProfiles: [],
      today: "2026-11-18",
      paceBasis: "moving",
    });
    expect(r.rows[0]).toMatchObject({
      type: "week_summary",
      summary: { key: "2026-11-30", activityCount: 0 },
    });
    expect(r.rows.slice(1).map((x) => x.type === "plan_only" && x.plan.sequence)).toEqual([0, 1]);
    expect(report.yearSummaries[0]?.key).toBe("2026");
  });

  it("marks manually unlinked plans", () => {
    const p = plan({ calendarDate: "2026-11-16" });
    const r = buildActivitiesReport({
      activities: [longRun],
      planEntries: [p],
      overrides: [{ planEntryId: p.id, activityId: null }],
      hrProfiles: [],
      today: "2026-11-18",
    });
    expect(r.rows.find((x) => x.type === "plan_only")).toMatchObject({ status: "unlinked" });
    expect(r.rows.find((x) => x.type === "activity")).toMatchObject({ zone: null });
  });
});
