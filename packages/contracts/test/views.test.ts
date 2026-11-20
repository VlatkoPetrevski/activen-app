import type { Activity } from "@activen/domain";
import { describe, expect, it } from "vitest";
import {
  calendarView,
  coachRowRange,
  coachRowView,
  progressView,
  type PlanEntryDto,
} from "../src/index.js";

const run = (id: string, date: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  athleteId: "a",
  source: { vendor: "garmin", externalId: id },
  activityName: "Run",
  activityType: "RUNNING",
  calendarDate: date,
  startTimeInSeconds: Date.parse(`${date}T07:00:00Z`) / 1000,
  startTimeOffsetInSeconds: 3600,
  distanceInMeters: 10000,
  durationInSeconds: 3000,
  movingDurationInSeconds: 2950,
  totalElevationGainInMeters: 50,
  trainingLoad: 80,
  averageHeartRateInBeatsPerMinute: 140,
  maxHeartRateInBeatsPerMinute: 160,
  averagePowerInWatts: null,
  activeKilocalories: 600,
  gearName: null,
  isRace: false,
  deleted: false,
  ...extra,
});
const plan = (id: string, date: string, kind: "workout" | "rest" = "workout"): PlanEntryDto => ({
  id,
  athleteId: "a",
  calendarDate: date,
  kind,
  description: "x",
  plannedActivityType: kind === "rest" ? null : "RUNNING",
  plannedDistanceInMeters: null,
  plannedDurationInSeconds: null,
  notes: null,
  sequence: 0,
  version: 1,
});

const today = "2026-11-19"; // Thursday
const entries = [
  plan("p-mon", "2026-11-16", "rest"),
  plan("p-tue", "2026-11-17"),
  plan("p-wed", "2026-11-18"),
  plan("p-sat", "2026-11-21"),
];
const activities = [
  run("a-tue", "2026-11-17", { trainingLoad: 60 }),
  run("a-thu-prev", "2026-11-12"),
];
const feedback = new Map([
  ["a-tue", { perceivedEffort: 9, feel: 2, comment: "heavy", updatedAt: "" }],
]);
const base = {
  athleteId: "a",
  from: "2026-11-12",
  to: "2026-11-22",
  entries,
  activities,
  overrides: [],
  feedback,
};

describe("calendarView", () => {
  it("links plan to activities and attaches check-ins", () => {
    const cal = calendarView({ ...base, activitiesVisible: true });
    expect(cal.links.find((l) => l.planEntryId === "p-tue")?.activityId).toBe("a-tue");
    expect(cal.activities.find((a) => a.id === "a-tue")?.feedback?.perceivedEffort).toBe(9);
    expect(cal.activities.find((a) => a.id === "a-thu-prev")?.feedback).toBeNull();
  });
  it("hides activities without consent", () => {
    const cal = calendarView({ ...base, activitiesVisible: false });
    expect(cal.activities).toEqual([]);
    expect(cal.links.every((l) => l.activityId === null)).toBe(true);
  });
});

describe("progressView", () => {
  it("fills empty weeks and compares 4-week windows", () => {
    const p = progressView(activities, today, 6);
    expect(p.weeks.map((w) => w.key)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(p.weeks[0]!.activityCount).toBe(0);
    expect(p.weeks.at(-1)!.distanceInMeters).toBe(10000);
    expect(p.last4Weeks.count).toBe(2);
    expect(p.previous4Weeks.count).toBe(0);
    expect(p.mix[0]).toMatchObject({ activityType: "RUNNING", count: 2 });
  });
});

describe("coachRowView", () => {
  const range = coachRowRange(today);
  const calendar = calendarView({
    ...base,
    from: range.from,
    to: range.to,
    activitiesVisible: true,
  });
  const row = {
    linkId: "l",
    athleteId: "a",
    displayName: "A",
    scopes: ["activities" as const],
    primarySource: "garmin" as const,
    today,
  };

  it("covers the last 7 days and the current week", () => {
    expect(coachRowRange(today)).toEqual({ from: "2026-11-12", to: "2026-11-22" });
    expect(coachRowRange("2026-11-22")).toEqual({ from: "2026-11-15", to: "2026-11-22" });
  });

  it("reports week progress, last activity and signals", () => {
    const r = coachRowView({
      ...row,
      status: "active",
      calendar,
      lastComment: { body: "help", createdAt: "2026-11-18T10:00:00Z", authorId: "a" },
    });
    expect(r.week).toEqual({ planned: 3, completed: 1 });
    // Only this week (Mon 16 – Thu 19) counts; the run on the 12th belongs to last week.
    expect(r.weekTotals).toEqual({ distanceInMeters: 10000, durationInSeconds: 3000, count: 1 });
    expect(r.lastActivity).toMatchObject({ calendarDate: "2026-11-17", perceivedEffort: 9 });
    expect(r.signals).toEqual([
      { code: "missed_sessions", count: 1 },
      { code: "high_effort_on_easy_day", perceivedEffort: 9, calendarDate: "2026-11-17" },
      { code: "awaiting_reply" },
    ]);
    expect(r.lastComment).toMatchObject({ fromAthlete: true });
  });

  it("does not judge what it cannot see, and handles invitations", () => {
    const hidden = coachRowView({
      ...row,
      status: "active",
      calendar: calendarView({ ...base, from: range.from, to: range.to, activitiesVisible: false }),
      lastComment: { body: "ok", createdAt: "", authorId: "coach" },
    });
    expect(hidden.signals).toEqual([]);
    expect(hidden.lastActivity).toBeNull();
    expect(hidden.weekTotals).toBeNull();
    expect(hidden.lastComment?.fromAthlete).toBe(false);
    const invited = coachRowView({ ...row, status: "invited" });
    expect(invited).toMatchObject({
      status: "invited",
      primarySource: null,
      signals: [],
      week: { planned: 0, completed: 0 },
      weekTotals: null,
    });
  });
});
