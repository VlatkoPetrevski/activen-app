import { addDays, localDateOf, weekStart, type LocalDate } from "@activen/domain";

export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateOf(now.toISOString(), timeZone);
}

export function weekOf(date: LocalDate): { from: LocalDate; to: LocalDate; days: LocalDate[] } {
  const from = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return { from, to: addDays(from, 6), days };
}

/** Short relative label: Today / Yesterday / Tomorrow, otherwise null. */
export function relativeDay(
  date: LocalDate,
  today: LocalDate,
): "today" | "yesterday" | "tomorrow" | null {
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  if (date === addDays(today, 1)) return "tomorrow";
  return null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
