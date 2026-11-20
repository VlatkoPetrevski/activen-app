import { addDays, type LocalDate } from "@activen/domain";
import { describe, expect, it } from "vitest";
import {
  analyticsRange,
  analyticsSummary,
  athleteAnalytics,
  fitnessSeries,
  loadRatioLevel,
  sessionLoad,
  sortByAttention,
  type ActivityDto,
  type AnalyticsSummaryDto,
  type CalendarDto,
  type PlanEntryDto,
} from "../src/index.js";

const today = "2026-11-19" as LocalDate; // Thursday

const act = (
  id: string,
  date: LocalDate,
  km: number,
  extra: Partial<ActivityDto> = {},
): ActivityDto => ({
  id,
  athleteId: "a",
  source: { vendor: "garmin", externalId: id },
  activityName: id,
  activityType: "RUNNING",
  calendarDate: date,
  startTimeInSeconds: Date.parse(`${date}T07:00:00Z`) / 1000,
  startTimeOffsetInSeconds: 0,
  distanceInMeters: km * 1000,
  durationInSeconds: km * 330,
  movingDurationInSeconds: null,
  totalElevationGainInMeters: 40,
  trainingLoad: 60,
  averageHeartRateInBeatsPerMinute: 145,
  maxHeartRateInBeatsPerMinute: 165,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
  deleted: false,
  feedback: null,
  ...extra,
});
const plan = (id: string, date: LocalDate, kind: "workout" | "rest" = "workout"): PlanEntryDto => ({
  id,
  athleteId: "a",
  calendarDate: date,
  kind,
  description: id,
  plannedActivityType: kind === "rest" ? null : "RUNNING",
  plannedDistanceInMeters: 10_000,
  plannedDurationInSeconds: 3300,
  notes: null,
  sequence: 0,
  version: 1,
});
const rated = (rpe: number) => ({ perceivedEffort: rpe, feel: 3, comment: null, updatedAt: "" });

/** Six weeks of steady 10 km runs every other day, then a big last week with a long run. */
function calendar(visible = true): CalendarDto {
  const { from, to } = analyticsRange(today);
  const entries: PlanEntryDto[] = [];
  const activities: ActivityDto[] = [];
  const links: CalendarDto["links"] = [];
  for (let d = from; d <= to; d = addDays(d, 2)) {
    const id = `p${d}`;
    entries.push(plan(id, d));
    const recentWeek = d > addDays(today, -7);
    if (d < today && !(d === addDays(today, -5))) {
      const a = act(`a${d}`, d, recentWeek ? 12 : 10, recentWeek ? { trainingLoad: 140 } : {});
      activities.push(a);
      links.push({ planEntryId: id, activityId: a.id, reason: "auto_single", warning: null });
    } else links.push({ planEntryId: id, activityId: null, reason: "no_candidate", warning: null });
  }
  activities.push(
    act("long", addDays(today, -1), 18, {
      trainingLoad: 220,
      feedback: rated(9),
      startTimeInSeconds: Date.parse(`${addDays(today, -1)}T17:00:00Z`) / 1000,
    }),
    act("hard", addDays(today, -2), 5, { trainingLoad: 90, feedback: rated(8) }),
    act("bike", addDays(today, -20), 25, { activityType: "CYCLING", feedback: rated(3) }),
  );
  return {
    athleteId: "a",
    from,
    to,
    entries,
    activities: visible ? activities : [],
    links: visible ? links : links.map((l) => ({ ...l, activityId: null })),
    activitiesVisible: visible,
  };
}

const input = (c: CalendarDto) => ({
  athleteId: "a",
  displayName: "Ана",
  scopes: ["activities" as const],
  calendar: c,
  today,
});

describe("load helpers", () => {
  it("grades the acute:chronic ratio", () => {
    expect([0.7, 0.8, 1.3, 1.31, 1.5, 1.51].map(loadRatioLevel)).toEqual([
      "low",
      "optimal",
      "optimal",
      "elevated",
      "elevated",
      "high",
    ]);
  });

  it("uses Training Load, then session RPE, then minutes", () => {
    expect(sessionLoad(act("x", today, 10))).toBe(60);
    expect(sessionLoad(act("x", today, 10, { trainingLoad: null, feedback: rated(6) }))).toBe(110);
    expect(sessionLoad(act("x", today, 10, { trainingLoad: null }))).toBe(55);
  });

  it("converges fitness and fatigue on a steady load; form starts the day", () => {
    const c: CalendarDto = {
      ...calendar(),
      from: "2026-01-01",
      activities: Array.from({ length: 300 }, (_, i) =>
        act(`d${i}`, addDays("2026-01-01", i), 10, { trainingLoad: 50 }),
      ),
    };
    const last = fitnessSeries(c, "2026-10-20", "2026-10-27").at(-1);
    expect(last?.fitness).toBeCloseTo(50, 0);
    expect(last?.fatigue).toBeCloseTo(50, 0);
    expect(Math.abs(last?.form ?? 99)).toBeLessThan(1);
  });
});

describe("analyticsSummary", () => {
  it("shows compliance, load, spike, effort and flags", () => {
    const s = analyticsSummary(input(calendar()));
    expect(s.last7).toHaveLength(7);
    expect(s.last7.at(-1)?.date).toBe(today);
    expect(s.last7.map((d) => d.state)).toContain("missed");
    expect(s.last7.at(-1)?.state).toBe("none");
    expect(s.completion28.planned).toBe(14);
    expect(s.completion28.done).toBe(13);
    expect(s.weeklyDistance).toHaveLength(8);
    expect(s.loadRatio?.level).toBe("high");
    expect(s.longRunSpike).toEqual({
      distanceInMeters: 18_000,
      previousLongestInMeters: 10_000,
      percent: 80,
    });
    expect(s.effort7).toEqual({ averageRpe: 8.5, hard: 2, rated: 2 });
    expect(s.form).toBeLessThan(0);
    expect(s.lastActivityDate).toBe(addDays(today, -1));
    expect(s.flags.map((f) => f.code)).toEqual(["load_high", "long_run_spike", "hard_efforts"]);
  });

  it("judges nothing it cannot see", () => {
    const s = analyticsSummary(input(calendar(false)));
    expect(s.activitiesVisible).toBe(false);
    expect(s.loadRatio).toBeNull();
    expect(s.weeklyDistance).toEqual([]);
    expect(s.flags).toEqual([]);
    expect(s.last7.some((d) => d.state === "missed")).toBe(false);
  });

  it("flags low compliance and inactivity, and sorts attention first", () => {
    const c = calendar();
    const quiet: CalendarDto = {
      ...c,
      activities: c.activities.filter((a) => a.calendarDate < addDays(today, -20)),
      links: c.links.map((l) =>
        l.activityId &&
        (c.activities.find((a) => a.id === l.activityId)?.calendarDate ?? "") >= addDays(today, -20)
          ? { ...l, activityId: null }
          : l,
      ),
    };
    const s = analyticsSummary({ ...input(quiet), displayName: "Бобан" });
    const codes = s.flags.map((f) => f.code);
    expect(codes).toContain("low_compliance");
    expect(codes).toContain("inactive");
    const calm: AnalyticsSummaryDto = { ...s, displayName: "Ана", flags: [] };
    expect(sortByAttention([calm, s]).map((r) => r.displayName)).toEqual(["Бобан", "Ана"]);
  });
});

describe("athleteAnalytics", () => {
  it("builds 12 weeks, fitness, sport mix, effort and wellness", () => {
    const w = (date: LocalDate) => ({
      calendarDate: date,
      trainingReadiness: 70,
      hrvStatus: "balanced" as const,
      lastNightHrvMs: 60,
      sleepScore: 80,
      sleepDurationInSeconds: 27_000,
      restingHeartRate: 48,
      recoveryTimeInMinutes: 600,
    });
    const a = athleteAnalytics({
      ...input(calendar()),
      wellness: [w(addDays(today, -20)), w(today), w(addDays(today, -1))],
    });
    expect(a.weeks).toHaveLength(12);
    expect(a.weeks.at(-1)?.sessionsPlanned).toBeGreaterThan(0);
    expect(a.fitness).toHaveLength(84);
    expect(a.byGroup.map((g) => g.group)).toEqual(["running", "cycling"]);
    expect(a.effort).toMatchObject({ hard: 2, easy: 1 });
    expect(a.wellness?.map((x) => x.calendarDate)).toEqual([addDays(today, -1), today]);
    expect(a.activities[0]?.id).toBe("long");
    expect(athleteAnalytics({ ...input(calendar()), wellness: null }).wellness).toBeNull();
    const hidden = athleteAnalytics({ ...input(calendar(false)), wellness: null });
    expect(hidden.fitness).toEqual([]);
    expect(hidden.weeks.every((x) => x.distanceInMeters === 0)).toBe(true);
  });
});
