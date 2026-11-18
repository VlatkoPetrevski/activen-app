import { describe, expect, it } from "vitest";
import {
  addDays,
  dayName,
  isLocalDate,
  localDateOf,
  monthKey,
  weekStart,
  weekdayIndex,
  yearKey,
} from "../src/dates.js";
import { formatDuration, formatPace, metersToKm, paceSecondsPerKm } from "../src/format.js";
import { isRunning, activityGroup } from "../src/sport.js";

describe("dates", () => {
  it("validates local dates including leap years", () => {
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2023-02-29")).toBe(false);
    expect(isLocalDate("2024-13-01")).toBe(false);
    expect(isLocalDate("2024-1-01")).toBe(false);
  });

  it("converts UTC instants to the athlete-local date", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Skopje (UTC+1).
    expect(localDateOf("2023-12-31T23:30:00Z", "Europe/Skopje")).toBe("2024-01-01");
    expect(localDateOf("2023-12-31T23:30:00Z", "America/New_York")).toBe("2023-12-31");
    expect(() => localDateOf("nope", "UTC")).toThrow(RangeError);
  });

  it("derives day names and Monday-based weeks", () => {
    expect(dayName("2026-11-16")).toBe("Monday");
    expect(dayName("2026-11-22")).toBe("Sunday");
    expect(weekdayIndex("2026-11-22")).toBe(6);
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    // Week spanning a year boundary.
    expect(weekStart("2025-01-01")).toBe("2024-12-30");
  });

  it("adds days across month ends and builds period keys", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(monthKey("2026-11-18")).toBe("2026-11");
    expect(yearKey("2026-11-18")).toBe("2026");
    expect(() => monthKey("bad")).toThrow(RangeError);
    expect(() => yearKey("bad")).toThrow(RangeError);
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("format", () => {
  it("converts meters to km with 2 decimals", () => {
    expect(metersToKm(10_234)).toBe(10.23);
    expect(metersToKm(null)).toBeNull();
  });

  it("computes and formats pace as MM:SS min/km", () => {
    expect(paceSecondsPerKm(3_000, 10_000)).toBe(300);
    expect(formatPace(300)).toBe("05:00");
    expect(formatPace(299.6)).toBe("05:00");
    expect(formatPace(4_500)).toBe("75:00");
    expect(paceSecondsPerKm(3_000, 0)).toBeNull();
    expect(paceSecondsPerKm(0, 1_000)).toBeNull();
    expect(paceSecondsPerKm(null, 1_000)).toBeNull();
    expect(paceSecondsPerKm(100, null)).toBeNull();
    expect(formatPace(null)).toBe("");
    expect(formatPace(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("formats durations as HH:MM:SS", () => {
    expect(formatDuration(3_725)).toBe("01:02:05");
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(90_000)).toBe("25:00:00");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(-1)).toBe("");
  });
});

describe("activity groups", () => {
  it("treats trail, treadmill and virtual runs as running", () => {
    expect(isRunning("TREADMILL_RUNNING")).toBe(true);
    expect(isRunning("RUNNING")).toBe(true);
    expect(isRunning("TRAIL_RUNNING")).toBe(true);
    expect(isRunning("VIRTUAL_RUN")).toBe(true);
    expect(isRunning("CYCLING")).toBe(false);
  });

  it("falls back to 'other' for unknown activity types", () => {
    expect(activityGroup("GRAVEL_CYCLING")).toBe("cycling");
    expect(activityGroup("Kitesurf")).toBe("other");
  });
});
