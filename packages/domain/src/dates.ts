import type { LocalDate } from "./types.js";

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type DayName = (typeof DAY_NAMES)[number];

/** Returns true when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function assertLocalDate(value: string): void {
  if (!isLocalDate(value)) throw new RangeError(`Invalid local date: "${value}"`);
}

function toUtcMidnight(date: LocalDate): Date {
  assertLocalDate(date);
  return new Date(`${date}T00:00:00Z`);
}

function fromUtcMidnight(dt: Date): LocalDate {
  return dt.toISOString().slice(0, 10);
}

/** Converts a UTC instant to the calendar date in the given IANA timezone. */
export function localDateOf(instantIso: string, timeZone: string): LocalDate {
  const instant = new Date(instantIso);
  if (Number.isNaN(instant.getTime())) throw new RangeError(`Invalid instant: "${instantIso}"`);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const dt = toUtcMidnight(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcMidnight(dt);
}

/** ISO weekday index: Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: LocalDate): number {
  return (toUtcMidnight(date).getUTCDay() + 6) % 7;
}

/** Day name derived from the date (spec field B). */
export function dayName(date: LocalDate): DayName {
  return DAY_NAMES[weekdayIndex(date)] as DayName;
}

/** Monday of the Monday–Sunday week containing `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekdayIndex(date));
}

/** `YYYY-MM` key of the calendar month. */
export function monthKey(date: LocalDate): string {
  assertLocalDate(date);
  return date.slice(0, 7);
}

/** `YYYY` key of the calendar year. */
export function yearKey(date: LocalDate): string {
  assertLocalDate(date);
  return date.slice(0, 4);
}
