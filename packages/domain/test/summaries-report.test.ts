import { describe, expect, it } from "vitest";
import { buildActivitiesReport, REPORT_COLORS } from "../src/report.js";
import { emptySummary, summarize, UNCLASSIFIED_ZONE } from "../src/summaries.js";
import { activity, defaultProfile, plan } from "./fixtures.js";

describe("summarize (spec §10, AC-08)", () => {
  const acts = [
    // Week of 2026-11-09
    activity({
      localDate: "2026-11-09",
      distanceM: 10_000,
      elapsedTimeS: 3_000,
      avgHr: 140,
      relativeEffort: 30,
    }),
    activity({
      localDate: "2026-11-15",
      distanceM: 5_000,
      elapsedTimeS: 1_800,
      avgHr: 160,
      relativeEffort: null,
    }),
    activity({
      localDate: "2026-11-14",
      sportType: "Ride",
      distanceM: 40_000,
      elapsedTimeS: 5_400,
      avgHr: null,
      relativeEffort: 50,
      elevationGainM: 300,
    }),
    // Week of 2026-11-16
    activity({ localDate: "2026-11-16", distanceM: 8_000, elapsedTimeS: 2_400, movingTimeS: null }),
    activity({ localDate: "2026-11-17", deleted: true }),
  ];

  it("groups Monday–Sunday, newest week first, excluding deleted activities", () => {
    const weeks = summarize(acts, "week");
    expect(weeks.map((w) => w.key)).toEqual(["2026-11-16", "2026-11-09"]);
    expect(weeks[1]).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-15",
      activityCount: 3,
      runCount: 2,
    });
    expect(weeks[0]?.activityCount).toBe(1);
  });

  it("sums distance/time and weights running pace by total run time / total run distance", () => {
    const w = summarize(acts, "week")[1]!;
    expect(w.totalDistanceM).toBe(55_000);
    expect(w.runDistanceM).toBe(15_000);
    expect(w.totalElapsedS).toBe(10_200);
    expect(w.runElapsedS).toBe(4_800);
    expect(w.elevationGainM).toBe(400);
    // (3000 + 1800) s / 15 km = 320 s/km — not the mean of the two paces (300 and 360 → 330).
    expect(w.runPaceSPerKm).toBe(320);
  });

  it("averages HR and Relative Effort over available values only", () => {
    const w = summarize(acts, "week")[1]!;
    expect(w.avgHr).toBe(150);
    expect(w.avgRelativeEffort).toBe(40);
  });

  it("supports moving-time pace, falling back to elapsed when moving time is missing", () => {
    const w = summarize(acts, "week", { paceBasis: "moving" });
    expect(w[1]?.runPaceSPerKm).toBeCloseTo((2_900 + 2_900) / 15, 6);
    expect(w[0]?.runPaceSPerKm).toBe(300);
  });

  it("produces month and year summaries with calendar ranges", () => {
    const months = summarize(
      [activity({ localDate: "2024-02-10" }), activity({ localDate: "2024-03-01" })],
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
    expect(w.zoneElapsedS).toEqual({ AeT: 3_000, Tempo: 1_800, [UNCLASSIFIED_ZONE]: 5_400 });
    expect(summarize(acts, "week")[1]?.zoneElapsedS).toBeNull();
  });

  it("handles weeks without running distance or HR", () => {
    const w = summarize(
      [
        activity({
          localDate: "2026-11-16",
          sportType: "WeightTraining",
          distanceM: null,
          avgHr: null,
          relativeEffort: null,
        }),
      ],
      "week",
    )[0]!;
    expect(w.runPaceSPerKm).toBeNull();
    expect(w.avgHr).toBeNull();
    expect(w.avgRelativeEffort).toBeNull();
    expect(emptySummary("2026-11-16", "week")).toMatchObject({
      to: "2026-11-22",
      activityCount: 0,
      zoneElapsedS: null,
    });
  });
});

describe("buildActivitiesReport (spec §5, §11, AC-04, AC-06, AC-09)", () => {
  const profile = defaultProfile();
  const longRun = activity({
    localDate: "2026-11-16",
    name: "Morning Run",
    distanceM: 12_000,
    avgHr: 155,
    startTime: "2026-11-16T06:00:00Z",
  });
  const shortRun = activity({
    localDate: "2026-11-16",
    name: "Shakeout",
    distanceM: 3_000,
    avgHr: null,
    startTime: "2026-11-16T17:00:00Z",
  });
  const ride = activity({
    localDate: "2026-11-15",
    name: "Gravel loop",
    sportType: "Ride",
    avgHr: 130,
  });
  const race = activity({ localDate: "2026-11-08", name: "City 10K", isRace: true, avgHr: 175 });
  const p16 = plan({ date: "2026-11-16", description: "10 km tempo" });
  const p15 = plan({ date: "2026-11-15", description: "Easy run 8 km" });
  const rest = plan({ date: "2026-11-17", kind: "rest", description: "Rest" });
  const future = plan({ date: "2026-11-20", description: "Intervals 6×800" });

  const report = buildActivitiesReport({
    activities: [ride, longRun, race, shortRun],
    planEntries: [p16, p15, rest, future],
    hrProfiles: [profile],
    today: "2026-11-18",
  });
  const rows = report.rows;

  it("orders newest first with a weekly summary row above each Monday–Sunday block", () => {
    expect(rows.map((r) => (r.type === "week_summary" ? `W:${r.summary.key}` : r.date))).toEqual([
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
    expect(longRow?.type === "activity" && longRow.activity.name).toBe("Morning Run");
    expect(shortRow?.type === "activity" && shortRow.plan).toBeNull();
  });

  it("keeps future plans and unmatched past plans visible without fake activities (AC-04)", () => {
    const planOnly = rows.filter((r) => r.type === "plan_only");
    expect(planOnly.map((r) => r.type === "plan_only" && [r.date, r.status])).toEqual([
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
        plan({ date: "2026-12-01" }),
        plan({ date: "2026-12-01", sequence: 1, kind: "rest" }),
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
    const p = plan({ date: "2026-11-16" });
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
