/**
 * Polar sleep and Nightly Recharge → ActiveN daily wellness (ADR-0013).
 *
 * - Sleep (`/v3/users/sleep`): the morning is the local date the sleep ended (`sleep_end_time`
 *   carries the offset), falling back to `date`. Duration = light + deep + REM + unrecognised
 *   stages (seconds); `sleep_score` 1–100.
 * - Nightly Recharge (`/v3/users/nightly-recharge`): `heart_rate_avg` (the night's average heart
 *   rate, Polar's closest value to a resting HR), `heart_rate_variability_avg` (RMSSD, ms) and
 *   `nightly_recharge_status` 1–6 (very poor … very good) as the vendor readiness (17–100).
 */
import type { LocalDate, WellnessRecord } from "@activen/domain";
import { isLocalDate } from "@activen/domain";

export interface PolarNight {
  date?: string;
  sleep_end_time?: string;
  light_sleep?: number;
  deep_sleep?: number;
  rem_sleep?: number;
  unrecognized_sleep_stage?: number;
  sleep_score?: number;
}

export interface PolarRecharge {
  date?: string;
  heart_rate_avg?: number;
  heart_rate_variability_avg?: number;
  nightly_recharge_status?: number;
}

type Fields = Partial<Omit<WellnessRecord, "calendarDate" | "source">>;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const inRange = (v: number | null, lo: number, hi: number) =>
  v !== null && v >= lo && v <= hi ? v : null;

/** The local calendar date of an ISO time with offset ("2026-11-21T06:40:00+01:00" → 2026-11-21). */
function localDateOfOffsetTime(iso: string | undefined): LocalDate | null {
  const date = iso?.slice(0, 10);
  return date && isLocalDate(date) ? date : null;
}

export function polarSleep(night: PolarNight): { calendarDate: LocalDate; fields: Fields } | null {
  const calendarDate =
    localDateOfOffsetTime(night.sleep_end_time) ??
    (night.date && isLocalDate(night.date) ? night.date : null);
  if (!calendarDate) return null;
  const parts = [
    night.light_sleep,
    night.deep_sleep,
    night.rem_sleep,
    night.unrecognized_sleep_stage,
  ]
    .map(num)
    .filter((v): v is number => v !== null);
  const duration = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0)) : null;
  const score = inRange(num(night.sleep_score), 0, 100);
  return {
    calendarDate,
    fields: {
      sleepDurationInSeconds: inRange(duration, 1, 86_400),
      sleepScore: score === null ? null : Math.round(score),
    },
  };
}

export function polarRecharge(
  r: PolarRecharge,
): { calendarDate: LocalDate; fields: Fields } | null {
  if (!r.date || !isLocalDate(r.date)) return null;
  const hr = inRange(num(r.heart_rate_avg), 20, 200);
  const hrv = inRange(num(r.heart_rate_variability_avg), 1, 500);
  const status = inRange(num(r.nightly_recharge_status), 1, 6);
  return {
    calendarDate: r.date,
    fields: {
      restingHeartRate: hr === null ? null : Math.round(hr),
      lastNightHrvMs: hrv,
      vendorReadiness: status === null ? null : Math.round((status / 6) * 100),
    },
  };
}
