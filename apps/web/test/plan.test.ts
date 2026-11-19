import type { CalendarDto } from "@activen/contracts";
import { describe, expect, it } from "vitest";
import { initials, relativeDay, todayIn, weekOf } from "../src/lib/dates.js";
import { buildDays, dayMark, groupOf, workoutStructure } from "../src/lib/plan.js";

const entry = (id: string, date: string, kind: "workout" | "rest" = "workout") => ({
  id,
  athleteId: "a",
  calendarDate: date,
  kind,
  description: kind === "rest" ? "Одмор" : "10 km",
  plannedActivityType: kind === "rest" ? null : ("RUNNING" as const),
  plannedDistanceInMeters: null,
  plannedDurationInSeconds: null,
  notes: null,
  sequence: 0,
  version: 1,
});
const activity = (id: string, date: string) =>
  ({
    id,
    calendarDate: date,
    activityType: "RUNNING",
    feedback: null,
  }) as unknown as CalendarDto["activities"][number];

describe("plan days", () => {
  const calendar: CalendarDto = {
    athleteId: "a",
    from: "2026-11-16",
    to: "2026-11-22",
    entries: [
      entry("p1", "2026-11-16", "rest"),
      entry("p2", "2026-11-17"),
      entry("p3", "2026-11-18"),
      entry("p4", "2026-11-20"),
    ],
    activities: [activity("a1", "2026-11-17"), activity("a2", "2026-11-19")],
    links: [
      { planEntryId: "p1", activityId: null, reason: "rest_day", warning: null },
      { planEntryId: "p2", activityId: "a1", reason: "auto_single", warning: null },
      { planEntryId: "p3", activityId: null, reason: "no_candidate", warning: null },
      { planEntryId: "p4", activityId: null, reason: "no_candidate", warning: null },
    ],
    activitiesVisible: true,
  };
  const days = buildDays(calendar, weekOf("2026-11-19").days, "2026-11-19");

  it("classifies entries and finds unplanned activities", () => {
    expect(days.map(dayMark)).toEqual([
      "rest",
      "done",
      "missed",
      "extra",
      "planned",
      "empty",
      "empty",
    ]);
    expect(days[3]!.extras.map((a) => a.id)).toEqual(["a2"]);
  });

  it("does not call sessions missed when activities are not shared", () => {
    const hidden = buildDays(
      { ...calendar, activities: [], activitiesVisible: false },
      ["2026-11-18"],
      "2026-11-19",
    );
    expect(hidden[0]!.entries[0]!.status).toBe("planned");
  });

  it("derives a structure only for endurance sessions", () => {
    expect(
      workoutStructure({
        kind: "workout",
        description: "14 km со 6 × 1000 м на 5K темпо",
        plannedActivityType: "RUNNING",
      }),
    ).toHaveLength(13);
    expect(
      workoutStructure({ kind: "workout", description: "Фартлек", plannedActivityType: "RUNNING" }),
    ).toHaveLength(12);
    expect(
      workoutStructure({
        kind: "workout",
        description: "Long run 20 km",
        plannedActivityType: "RUNNING",
      }),
    ).toHaveLength(2);
    expect(
      workoutStructure({
        kind: "workout",
        description: "8 km recovery",
        plannedActivityType: "RUNNING",
      })[0]!.intensity,
    ).toBe(1);
    expect(
      workoutStructure({
        kind: "workout",
        description: "Сила",
        plannedActivityType: "STRENGTH_TRAINING",
      }),
    ).toEqual([]);
    expect(
      workoutStructure({ kind: "rest", description: "Rest", plannedActivityType: null }),
    ).toEqual([]);
    expect(groupOf(null)).toBe("rest");
    expect(groupOf("CYCLING")).toBe("cycling");
  });
});

describe("date helpers", () => {
  it("works in the athlete's time zone", () => {
    expect(todayIn("Europe/Skopje", new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
    expect(weekOf("2026-11-19")).toMatchObject({ from: "2026-11-16", to: "2026-11-22" });
    expect(relativeDay("2026-11-18", "2026-11-19")).toBe("yesterday");
    expect(relativeDay("2026-11-20", "2026-11-19")).toBe("tomorrow");
    expect(relativeDay("2026-11-10", "2026-11-19")).toBeNull();
    expect(initials("Влатко Петревски")).toBe("ВП");
    expect(initials("ana")).toBe("A");
  });
});
