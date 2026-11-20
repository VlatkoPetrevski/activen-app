import type { CalendarDto } from "@activen/contracts";
import { describe, expect, it } from "vitest";
import { dayState, monthGrid, monthOf, shiftMonth } from "../src/training/MonthCalendar.js";
import { weekTotals } from "../src/training/WeekStats.js";

const act = (id: string, date: string, km: number, min: number, type = "RUNNING") => ({
  id,
  athleteId: "a",
  source: { vendor: "garmin" as const, externalId: id },
  activityName: id,
  activityType: type as "RUNNING",
  calendarDate: date,
  startTimeInSeconds: 0,
  startTimeOffsetInSeconds: 0,
  distanceInMeters: km ? km * 1000 : null,
  durationInSeconds: min * 60,
  movingDurationInSeconds: null,
  totalElevationGainInMeters: 50,
  trainingLoad: 100,
  averageHeartRateInBeatsPerMinute: min > 50 ? 150 : null,
  maxHeartRateInBeatsPerMinute: null,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
  deleted: false,
  feedback: null,
});
const plan = (
  id: string,
  date: string,
  km: number | null,
  kind: "workout" | "rest" = "workout",
) => ({
  id,
  athleteId: "a",
  calendarDate: date,
  kind,
  description: id,
  plannedActivityType: kind === "rest" ? null : ("RUNNING" as const),
  plannedDistanceInMeters: km ? km * 1000 : null,
  plannedDurationInSeconds: km ? km * 330 : null,
  notes: null,
  sequence: 0,
  version: 1,
});

const calendar: CalendarDto = {
  athleteId: "a",
  from: "2026-11-16",
  to: "2026-11-22",
  entries: [
    plan("p1", "2026-11-17", 12),
    plan("p2", "2026-11-18", 10),
    plan("p3", "2026-11-21", 28),
    plan("r", "2026-11-16", null, "rest"),
  ],
  activities: [act("a1", "2026-11-17", 12, 60), act("a2", "2026-11-19", 27, 55, "CYCLING")],
  links: [
    { planEntryId: "p1", activityId: "a1", reason: "auto_single", warning: null },
    { planEntryId: "p2", activityId: null, reason: "no_candidate", warning: null },
  ],
  activitiesVisible: true,
};

describe("month calendar", () => {
  it("covers whole Monday-first weeks of the month", () => {
    const g = monthGrid("2026-11-01");
    expect(g.from).toBe("2026-10-26");
    expect(g.to).toBe("2026-12-06");
    expect(g.weeks).toHaveLength(6);
    expect(monthOf("2026-11-19")).toBe("2026-11-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("marks active, missed and planned days", () => {
    const today = "2026-11-20";
    expect(dayState(calendar, "2026-11-17", today)).toBe("active");
    expect(dayState(calendar, "2026-11-18", today)).toBe("missed");
    expect(dayState(calendar, "2026-11-21", today)).toBe("planned");
    expect(dayState(calendar, "2026-11-16", today)).toBeNull();
    expect(dayState({ ...calendar, activitiesVisible: false }, "2026-11-18", today)).toBe(
      "planned",
    );
    expect(dayState(undefined, "2026-11-18", today)).toBeNull();
  });
});

describe("week totals", () => {
  it("adds up plan against done, by sport", () => {
    const w = weekTotals(calendar, "2026-11-16", "2026-11-22");
    expect(w.sessions).toEqual({ done: 1, planned: 3 });
    expect(w.distance).toEqual({ done: 39_000, planned: 50_000 });
    expect(w.time).toEqual({ done: 115 * 60, planned: 50 * 330 });
    expect(w.elevation).toBe(100);
    expect(w.load).toBe(200);
    expect(w.averageHeartRate).toBe(150);
    expect(w.byGroup.map((g) => g.group)).toEqual(["running", "cycling"]);
  });
});
