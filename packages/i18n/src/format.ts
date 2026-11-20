import type { LocalDate, UnitSystem } from "@activen/domain";
import type { Locale } from "./locales.js";
import type { Translator } from "./translate.js";
import { formatMkDate, intlSupports, mkList, NUMBER_FALLBACK } from "./fallback.js";

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.280839895;
const GRAMS_PER_POUND = 453.59237;

export type DateStyle =
  "full" | "long" | "short" | "weekday" | "weekdayShort" | "dayMonth" | "monthYear";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long" },
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  weekday: { weekday: "long" },
  weekdayShort: { weekday: "short" },
  dayMonth: { day: "numeric", month: "long" },
  monthYear: { month: "long", year: "numeric" },
};

/** `m:ss` or `h:mm:ss`; no leading zero on the first unit (5:25, 1:16:12). */
function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export interface Formatter {
  readonly locale: Locale;
  readonly unitSystem: UnitSystem;
  number(value: number, maxFractionDigits?: number): string;
  /** Distance from metres: km or mi (default 2 decimals, trailing zeros dropped). */
  distance(meters: number, maxFractionDigits?: number): string;
  /** Elevation from metres: m or ft, whole numbers. */
  elevation(meters: number): string;
  /** Weight from grams (Garmin unit): kg or lb, one decimal. */
  weight(grams: number): string;
  /** Pace from seconds per km: "5:25 /km" or "8:43 /mi". Empty for missing/invalid values. */
  pace(secondsPerKm: number | null): string;
  /** Speed from metres per second: "28,4 km/h" or "17,6 mph". */
  speed(metersPerSecond: number): string;
  /** Duration: "45:03" or "1:16:12". Empty for missing/invalid values. */
  duration(seconds: number | null): string;
  /** Time spent, for totals: "5 h 12 min" / "45 min". Empty for missing/invalid values. */
  totalTime(seconds: number | null): string;
  /** Short distance unit of the user's system: "km" or "mi". */
  readonly distanceUnit: "km" | "mi";
  /** Metres to the user's distance unit, as a plain number (charts, inputs). */
  distanceValue(meters: number): number;
  /** The user's distance unit back to metres (inputs). */
  toMeters(value: number): number;
  /** Air temperature from °C: "12°" (°C) or "54°" (°F), whole degrees. */
  temperature(celsius: number): string;
  /** "°C" or "°F". */
  readonly temperatureUnit: "°C" | "°F";
  /** Wind from km/h (Open-Meteo unit): "12 km/h" or "7 mph". */
  windSpeed(kmh: number): string;
  heartRate(bpm: number): string;
  percent(value: number): string;
  /** Formats an athlete-local calendar date (`YYYY-MM-DD`). */
  date(calendarDate: LocalDate, style?: DateStyle): string;
  /** "а, б и в" / "a, b, and c". */
  list(items: readonly string[]): string;
}

/** Locale- and unit-aware formatting of training data. Storage stays metric (Garmin units). */
export interface FormatterOptions {
  /** Override detection of Intl locale data (tests). */
  intlSupported?: boolean;
}

export function createFormatter(
  translator: Translator,
  unitSystem: UnitSystem = "metric",
  options: FormatterOptions = {},
): Formatter {
  const locale = translator.locale;
  const native = options.intlSupported ?? intlSupports(locale);
  const numberLocale = native ? locale : (NUMBER_FALLBACK[locale] ?? locale);
  const mkFallback = !native && locale === "mk";
  const num = (value: number, max = 2, min = 0) =>
    new Intl.NumberFormat(numberLocale, {
      maximumFractionDigits: max,
      minimumFractionDigits: min,
    }).format(value);
  const unit = (value: number, u: string, max: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: "unit",
      unit: u,
      unitDisplay: "short",
      maximumFractionDigits: max,
    }).format(value);
  const imperial = unitSystem === "imperial";

  return {
    locale,
    unitSystem,
    number: (value, max = 2) => num(value, max),
    distance: (meters, max = 2) =>
      imperial
        ? unit(meters / METERS_PER_MILE, "mile", max)
        : unit(meters / 1000, "kilometer", max),
    elevation: (meters) =>
      imperial
        ? unit(Math.round(meters * FEET_PER_METER), "foot", 0)
        : unit(Math.round(meters), "meter", 0),
    weight: (grams) =>
      imperial ? unit(grams / GRAMS_PER_POUND, "pound", 1) : unit(grams / 1000, "kilogram", 1),
    speed: (mps) =>
      unitSystem === "imperial"
        ? `${num(mps * 2.236936, 1, 1)} mph`
        : `${num(mps * 3.6, 1, 1)} km/h`,
    pace(secondsPerKm) {
      if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "";
      return imperial
        ? translator.t("unit.pacePerMile", { pace: clock((secondsPerKm * METERS_PER_MILE) / 1000) })
        : translator.t("unit.pacePerKm", { pace: clock(secondsPerKm) });
    },
    duration(seconds) {
      if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
      return clock(seconds);
    },
    totalTime(seconds) {
      if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
      const minutes = Math.round(seconds / 60);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0
        ? translator.t("unit.hoursMinutes", { h: num(h, 0), m: num(m, 0) })
        : translator.t("unit.minutes", { m: num(m, 0) });
    },
    distanceUnit: imperial ? "mi" : "km",
    distanceValue: (meters) => (imperial ? meters / METERS_PER_MILE : meters / 1000),
    toMeters: (value) => (imperial ? value * METERS_PER_MILE : value * 1000),
    temperature: (celsius) => `${num(Math.round(imperial ? celsius * 1.8 + 32 : celsius), 0)}°`,
    temperatureUnit: imperial ? "°F" : "°C",
    windSpeed: (kmh) =>
      imperial ? `${num(Math.round(kmh / 1.609344), 0)} mph` : `${num(Math.round(kmh), 0)} km/h`,
    heartRate: (bpm) => translator.t("unit.bpm", { value: num(bpm, 0) }),
    percent: (value) =>
      new Intl.NumberFormat(numberLocale, { style: "percent", maximumFractionDigits: 0 }).format(
        value / 100,
      ),
    date(calendarDate, style = "long") {
      const instant = new Date(`${calendarDate}T00:00:00Z`);
      if (Number.isNaN(instant.getTime())) throw new RangeError(`Invalid date: "${calendarDate}"`);
      if (mkFallback) return formatMkDate(instant, style);
      return new Intl.DateTimeFormat(locale, { ...DATE_OPTIONS[style], timeZone: "UTC" }).format(
        instant,
      );
    },
    list: (items) =>
      mkFallback
        ? mkList(items)
        : new Intl.ListFormat(locale, { type: "conjunction" }).format(items),
  };
}
