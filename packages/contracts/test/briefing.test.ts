import { addDays, type Activity, type WellnessRecord } from "@activen/domain";
import { describe, expect, it } from "vitest";
import {
  buildBriefing,
  coachRowView,
  sessionOfTheDay,
  sleepRangeIndex,
  SLEEP_RANGES,
  wellnessRecordsOf,
  wellnessSeries,
  type PlanEntryDto,
} from "../src/index.js";

const TODAY = "2026-11-21";

const rec = (calendarDate: string, o: Partial<WellnessRecord> = {}): WellnessRecord => ({
  calendarDate,
  source: "polar",
  sleepDurationInSeconds: 7.5 * 3600,
  sleepScore: null,
  sleepQuality: null,
  restingHeartRate: 49,
  lastNightHrvMs: 60,
  vendorReadiness: null,
  ...o,
});

const history = Array.from({ length: 28 }, (_, i) =>
  rec(addDays(TODAY, -(i + 1)), { restingHeartRate: 48 + (i % 3), lastNightHrvMs: 58 + (i % 5) }),
);

const entry = (o: Partial<PlanEntryDto>): PlanEntryDto => ({
  id: "p1",
  athleteId: "a",
  calendarDate: TODAY,
  kind: "workout",
  description: "6 × 1 km @ 4:00",
  plannedActivityType: "RUNNING",
  plannedDistanceInMeters: 12_000,
  plannedDurationInSeconds: null,
  notes: null,
  sequence: 0,
  version: 1,
  ...o,
});

const run = (date: string): Activity => ({
  id: date,
  athleteId: "a",
  source: { vendor: "polar", externalId: date },
  activityName: "Run",
  activityType: "RUNNING",
  calendarDate: date,
  startTimeInSeconds: Date.parse(`${date}T07:00:00Z`) / 1000,
  startTimeOffsetInSeconds: 3600,
  distanceInMeters: 10_000,
  durationInSeconds: 3000,
  movingDurationInSeconds: 2950,
  totalElevationGainInMeters: null,
  trainingLoad: 60,
  averageHeartRateInBeatsPerMinute: null,
  maxHeartRateInBeatsPerMinute: null,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
  deleted: false,
});

const base = {
  athleteId: "a",
  calendarDate: TODAY,
  priority: ["polar" as const],
  activities: Array.from({ length: 12 }, (_, i) => run(addDays(TODAY, -1 - i * 2))),
  sleepNeedMinutes: 480,
};

describe("buildBriefing", () => {
  it("a short night with a raised pulse turns intervals into an easy run, manual input wins", () => {
    const b = buildBriefing({
      ...base,
      records: [
        ...history,
        rec(TODAY, { sleepDurationInSeconds: 6.5 * 3600, restingHeartRate: 50 }),
        rec(TODAY, {
          source: "manual",
          sleepDurationInSeconds: 4.5 * 3600,
          lastNightHrvMs: null,
          restingHeartRate: 56,
        }),
      ],
      entries: [entry({ id: "pm", sequence: 1, description: "Easy" }), entry({})],
    });
    expect(b.planEntry?.id).toBe("p1");
    expect(b.today).toMatchObject({
      sleepDurationInSeconds: 4.5 * 3600,
      sources: { sleepDurationInSeconds: "manual", lastNightHrvMs: "polar" },
    });
    expect(b.morningInput).toEqual({
      sleepDurationInSeconds: 4.5 * 3600,
      sleepQuality: null,
      restingHeartRate: 56,
    });
    expect(b.readiness.level).toBe("LOW");
    expect(b.advice).toMatchObject({
      verdict: "swap_easy",
      needsAttention: true,
      reason: { factor: "sleep" },
    });
  });

  it("a good morning keeps the plan; no data → no score; entries of other days are ignored", () => {
    const good = buildBriefing({
      ...base,
      records: [...history, rec(TODAY)],
      entries: [entry({})],
    });
    expect(good.advice.verdict).toBe("as_planned");
    expect(good.morningInput).toBeNull();
    const none = buildBriefing({
      ...base,
      records: [],
      entries: [entry({ calendarDate: "2026-11-22" })],
    });
    expect(none).toMatchObject({ planEntry: null, today: null, readiness: { score: null } });
  });

  it("hides the load ratio from a coach without the activities consent", () => {
    const b = buildBriefing({
      ...base,
      records: [...history, rec(TODAY)],
      entries: [],
      viewer: { activities: false },
    });
    const load = b.readiness.factors.find((f) => f.key === "load");
    expect(load).toMatchObject({ value: null, baseline: null });
    expect(load?.score).not.toBeNull();
    const own = buildBriefing({
      ...base,
      records: [...history, rec(TODAY)],
      entries: [],
      viewer: { activities: true },
    });
    expect(own.readiness.factors.find((f) => f.key === "load")?.value).not.toBeNull();
  });

  it("sessionOfTheDay picks the first workout, else a rest day", () => {
    expect(sessionOfTheDay([entry({ id: "r", kind: "rest" })])?.id).toBe("r");
    expect(
      sessionOfTheDay([entry({ id: "r", kind: "rest" }), entry({ id: "w", sequence: 2 })])?.id,
    ).toBe("w");
    expect(sessionOfTheDay([])).toBeNull();
  });
});

describe("sleep ranges", () => {
  it("maps a duration to its range and back to the middle", () => {
    expect(sleepRangeIndex(null)).toBeNull();
    expect(sleepRangeIndex(4 * 3600)).toBe(0);
    expect(sleepRangeIndex(6.5 * 3600)).toBe(2);
    expect(sleepRangeIndex(7 * 3600)).toBe(3);
    expect(sleepRangeIndex(11 * 3600)).toBe(5);
    expect(sleepRangeIndex(-1)).toBeNull();
    for (const [i, r] of SLEEP_RANGES.entries()) expect(sleepRangeIndex(r.seconds)).toBe(i);
  });
});

describe("wellnessSeries", () => {
  it("gives each day ActiveN readiness and an HRV status once there is history", () => {
    const series = wellnessSeries({
      ...base,
      from: addDays(TODAY, -2),
      to: TODAY,
      records: [...history, rec(TODAY, { lastNightHrvMs: 40 })],
    });
    expect(series.map((d) => d.calendarDate)).toEqual([
      addDays(TODAY, -2),
      addDays(TODAY, -1),
      TODAY,
    ]);
    expect(series[0]?.trainingReadiness).toBeGreaterThan(70);
    expect(series[0]?.hrvStatus).toBe("balanced");
    expect(series[2]?.recoveryTimeInMinutes).toBeNull();
    const short = wellnessSeries({ ...base, from: TODAY, to: TODAY, records: [rec(TODAY)] });
    expect(short[0]?.hrvStatus).toBe("none");
  });

  it("round-trips demo wellness into vendor records", () => {
    const [r] = wellnessRecordsOf(
      [
        {
          calendarDate: TODAY,
          trainingReadiness: 70,
          hrvStatus: "balanced",
          lastNightHrvMs: 60,
          sleepScore: 80,
          sleepDurationInSeconds: 27_000,
          restingHeartRate: 48,
          recoveryTimeInMinutes: 60,
        },
      ],
      "garmin",
    );
    expect(r).toEqual({
      ...rec(TODAY, {
        source: "garmin",
        sleepScore: 80,
        sleepDurationInSeconds: 27_000,
        restingHeartRate: 48,
      }),
      vendorReadiness: 70,
    });
  });
});

describe("coach signal", () => {
  it("flags low readiness before a demanding session only", () => {
    const row = {
      linkId: "l",
      athleteId: "a",
      displayName: "A",
      status: "active" as const,
      scopes: ["sleep_recovery" as const],
      primarySource: "polar" as const,
      today: TODAY,
      calendar: {
        athleteId: "a",
        from: TODAY,
        to: TODAY,
        entries: [],
        activities: [],
        links: [],
        activitiesVisible: false,
      },
    };
    expect(
      coachRowView({ ...row, briefing: { score: 38, needsAttention: true, calendarDate: TODAY } })
        .signals,
    ).toEqual([{ code: "low_readiness", score: 38, calendarDate: TODAY }]);
    expect(
      coachRowView({ ...row, briefing: { score: 38, needsAttention: false, calendarDate: TODAY } })
        .signals,
    ).toEqual([]);
    expect(coachRowView({ ...row, briefing: null }).signals).toEqual([]);
  });
});
