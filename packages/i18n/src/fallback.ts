/**
 * Macedonian formatting for runtimes without Macedonian ICU data. Chrome (and Chromium-based
 * browsers) ship a reduced ICU without "mk", so Intl would silently format dates in English.
 * Patterns follow CLDR "mk".
 */
import type { Locale } from "./locales.js";

const WEEKDAYS = ["понеделник", "вторник", "среда", "четврток", "петок", "сабота", "недела"];
const WEEKDAYS_SHORT = ["пон.", "вто.", "сре.", "чет.", "пет.", "саб.", "нед."];
const MONTHS = [
  "јануари",
  "февруари",
  "март",
  "април",
  "мај",
  "јуни",
  "јули",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];

/** True when this runtime's Intl has real data for the locale (dates and numbers). */
export function intlSupports(locale: Locale): boolean {
  try {
    return (
      Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0 &&
      Intl.NumberFormat.supportedLocalesOf([locale]).length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Number locale with the same separators when the locale itself is unavailable: Macedonian uses
 * "," for decimals and "." for grouping, like German.
 */
export const NUMBER_FALLBACK: Partial<Record<Locale, string>> = { mk: "de" };

export type FallbackDateStyle =
  "full" | "long" | "short" | "weekday" | "weekdayShort" | "dayMonth" | "monthYear";

/** Formats a UTC-midnight instant of a calendar date in Macedonian. */
export function formatMkDate(instant: Date, style: FallbackDateStyle): string {
  const d = instant.getUTCDate();
  const m = instant.getUTCMonth();
  const y = instant.getUTCFullYear();
  const wd = (instant.getUTCDay() + 6) % 7;
  switch (style) {
    case "full":
      return `${WEEKDAYS[wd]}, ${d} ${MONTHS[m]} ${y} г.`;
    case "long":
      return `${WEEKDAYS[wd]}, ${d} ${MONTHS[m]}`;
    case "short":
      return `${String(d).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}.${y} г.`;
    case "weekday":
      return WEEKDAYS[wd] ?? "";
    case "weekdayShort":
      return WEEKDAYS_SHORT[wd] ?? "";
    case "dayMonth":
      return `${d} ${MONTHS[m]}`;
    case "monthYear":
      return `${MONTHS[m]} ${y} г.`;
  }
}

/** "а, б и в" */
export function mkList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} и ${items.at(-1)}`;
}
