import type { ActivityDto } from "@activen/contracts";
import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyActivityFilter,
  DEFAULT_FILTER,
  totals,
} from "../src/lib/activityFilters.js";

let n = 0;
const act = (
  type: string,
  km: number,
  minutes: number,
  extra: Partial<ActivityDto> = {},
): ActivityDto =>
  ({
    id: `a${++n}`,
    activityName: "Run",
    activityType: type,
    calendarDate: "2026-11-10",
    startTimeInSeconds: n * 1000,
    distanceInMeters: km * 1000,
    durationInSeconds: minutes * 60,
    trainingLoad: km * 10,
    gearName: null,
    feedback: null,
    ...extra,
  }) as unknown as ActivityDto;

const list = [
  act("RUNNING", 10, 55, {
    feedback: { perceivedEffort: 4, feel: 3, comment: "лесно", updatedAt: "" },
  }),
  act("TRAIL_RUNNING", 15, 100, { activityName: "Vodno" }),
  act("TREADMILL_RUNNING", 6, 30, {
    feedback: { perceivedEffort: 8, feel: 2, comment: null, updatedAt: "" },
  }),
  act("CYCLING", 40, 90),
  act("STRENGTH_TRAINING", 0, 45, { distanceInMeters: null }),
  act("RUNNING", 25, 140),
];

describe("activity list filter", () => {
  it("defaults to everything, newest first", () => {
    expect(applyActivityFilter(list, DEFAULT_FILTER).map((a) => a.id)).toEqual([
      "a6",
      "a5",
      "a4",
      "a3",
      "a2",
      "a1",
    ]);
    expect(activeFilterCount(DEFAULT_FILTER)).toBe(0);
  });

  it("filters by sport and kind of run", () => {
    const running = { ...DEFAULT_FILTER, group: "running" as const };
    expect(applyActivityFilter(list, running)).toHaveLength(4);
    expect(applyActivityFilter(list, { ...running, run: "trail" }).map((a) => a.id)).toEqual([
      "a2",
    ]);
    expect(applyActivityFilter(list, { ...running, run: "treadmill" }).map((a) => a.id)).toEqual([
      "a3",
    ]);
    expect(applyActivityFilter(list, { ...running, run: "road" }).map((a) => a.id)).toEqual([
      "a6",
      "a1",
    ]);
    expect(applyActivityFilter(list, { ...running, run: "track" })).toEqual([]);
    expect(activeFilterCount({ ...running, run: "trail" })).toBe(2);
  });

  it("filters by distance, duration, check-in and text", () => {
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, distance: "21plus" }).map((a) => a.id),
    ).toEqual(["a6", "a4"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, distance: "5to10" }).map((a) => a.id),
    ).toEqual(["a3"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, distance: "lt5" }).map((a) => a.id),
    ).toEqual(["a5"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, distance: "10to21" }).map((a) => a.id),
    ).toEqual(["a2", "a1"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, duration: "120plus" }).map((a) => a.id),
    ).toEqual(["a6"]);
    expect(applyActivityFilter(list, { ...DEFAULT_FILTER, duration: "lt30" })).toEqual([]);
    expect(applyActivityFilter(list, { ...DEFAULT_FILTER, duration: "30to60" })).toHaveLength(3);
    expect(applyActivityFilter(list, { ...DEFAULT_FILTER, duration: "60to120" })).toHaveLength(2);
    expect(applyActivityFilter(list, { ...DEFAULT_FILTER, checkIn: "rated" })).toHaveLength(2);
    expect(applyActivityFilter(list, { ...DEFAULT_FILTER, checkIn: "unrated" })).toHaveLength(4);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, checkIn: "hard" }).map((a) => a.id),
    ).toEqual(["a3"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, query: "vodno" }).map((a) => a.id),
    ).toEqual(["a2"]);
    expect(
      applyActivityFilter(list, { ...DEFAULT_FILTER, query: "ЛЕСНО" }).map((a) => a.id),
    ).toEqual(["a1"]);
  });

  it("sorts by distance, pace, effort and load", () => {
    const ids = (sort: typeof DEFAULT_FILTER.sort) =>
      applyActivityFilter(list, { ...DEFAULT_FILTER, sort }).map((a) => a.id);
    expect(ids("longest")[0]).toBe("a4");
    expect(ids("fastest")[0]).toBe("a4"); // the ride
    expect(ids("fastest").at(-1)).toBe("a5"); // no distance last
    expect(ids("hardest")[0]).toBe("a3");
    expect(ids("load")[0]).toBe("a4");
    expect(totals(list)).toEqual({ count: 6, distanceInMeters: 96000, durationInSeconds: 27600 });
  });
});
