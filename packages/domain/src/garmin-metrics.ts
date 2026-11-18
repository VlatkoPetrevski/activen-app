/**
 * Garmin training concepts used across ActiveN (initial phase: Garmin is the reference model).
 *
 * Only the published, deterministic parts are implemented here — labels, levels and thresholds from
 * Garmin's device manuals. The underlying Firstbeat algorithms (EPOC, Training Effect, VO2 max) are
 * proprietary: ActiveN takes those values from the device when available and, for other vendors,
 * computes documented approximations in the analytics layer.
 */

// --- Training Readiness ---------------------------------------------------------------------------

/** Factors Garmin combines into Training Readiness. */
export const TRAINING_READINESS_FACTORS = [
  "sleepScore", // last night
  "recoveryTime",
  "hrvStatus",
  "acuteLoad",
  "sleepHistory", // last 3 nights
  "stressHistory", // last 3 days
] as const;
export type TrainingReadinessFactor = (typeof TRAINING_READINESS_FACTORS)[number];

export type TrainingReadinessLevel = "PRIME" | "HIGH" | "MODERATE" | "LOW" | "POOR";

/** Garmin bands: 95–100 Prime, 75–94 High, 50–74 Moderate, 25–49 Low, 1–24 Poor. */
export function trainingReadinessLevel(score: number): TrainingReadinessLevel {
  if (!Number.isFinite(score) || score < 1 || score > 100)
    throw new RangeError(`Training Readiness must be 1–100, got ${score}`);
  if (score >= 95) return "PRIME";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MODERATE";
  if (score >= 25) return "LOW";
  return "POOR";
}

// --- HRV Status ----------------------------------------------------------------------------------

export type HrvStatus = "BALANCED" | "UNBALANCED" | "LOW" | "POOR" | "NO_STATUS";

/** Garmin needs three weeks of consistent sleep data before HRV status is shown. */
export const HRV_BASELINE_MIN_NIGHTS = 21;

export interface HrvStatusInput {
  /** Nightly HRV values (ms) for the last 7 nights; missing nights omitted. */
  lastSevenNights: readonly number[];
  /** Nights of history available to build the baseline. */
  historyNights: number;
  /** Personal baseline range (ms). */
  baselineLow: number;
  baselineHigh: number;
  /** Lower edge of the normal range for the athlete's age (ms), if known. */
  ageNormLow?: number;
  /**
   * How far below the baseline counts as "well below" (fraction of the baseline width). Garmin does
   * not publish the exact threshold; ActiveN uses 50 % of the baseline width by default.
   */
  wellBelowFraction?: number;
}

export interface HrvStatusResult {
  status: HrvStatus;
  sevenDayAverage: number | null;
}

/**
 * Garmin HRV Status: Balanced = 7-day average within the baseline range; Unbalanced = above or
 * below it; Low = well below it; Poor = averaging well below the normal range for the athlete's age;
 * No status = not enough data for a 7-day average (or for a baseline).
 */
export function hrvStatus(input: HrvStatusInput): HrvStatusResult {
  const values = input.lastSevenNights.filter((v) => Number.isFinite(v) && v > 0);
  // A 7-day average needs most of the week; ActiveN requires at least 5 of 7 nights.
  if (values.length < 5 || input.historyNights < HRV_BASELINE_MIN_NIGHTS) {
    return { status: "NO_STATUS", sevenDayAverage: values.length ? mean(values) : null };
  }
  if (!(input.baselineLow < input.baselineHigh))
    throw new RangeError("baselineLow must be lower than baselineHigh");
  const avg = mean(values);
  const width = input.baselineHigh - input.baselineLow;
  const wellBelow = input.baselineLow - width * (input.wellBelowFraction ?? 0.5);
  let status: HrvStatus;
  if (input.ageNormLow !== undefined && avg < input.ageNormLow) status = "POOR";
  else if (avg < wellBelow) status = "LOW";
  else if (avg < input.baselineLow || avg > input.baselineHigh) status = "UNBALANCED";
  else status = "BALANCED";
  return { status, sevenDayAverage: avg };
}

// --- Training Effect -----------------------------------------------------------------------------

export type TrainingEffectBenefit =
  "NO_BENEFIT" | "MINOR" | "MAINTAINING" | "IMPACTING" | "HIGHLY_IMPACTING" | "OVERREACHING";

/**
 * Garmin Training Effect bands (aerobic and anaerobic share them): 0.0–0.9 no benefit, 1.0–1.9 minor,
 * 2.0–2.9 maintains, 3.0–3.9 impacts, 4.0–4.9 highly impacts, 5.0 overreaching.
 */
export function trainingEffectBenefit(value: number): TrainingEffectBenefit {
  if (!Number.isFinite(value) || value < 0 || value > 5)
    throw new RangeError(`Training Effect must be 0.0–5.0, got ${value}`);
  const v = Math.round(value * 10) / 10;
  if (v >= 5) return "OVERREACHING";
  if (v >= 4) return "HIGHLY_IMPACTING";
  if (v >= 3) return "IMPACTING";
  if (v >= 2) return "MAINTAINING";
  if (v >= 1) return "MINOR";
  return "NO_BENEFIT";
}

// --- Training Status & Load Focus ----------------------------------------------------------------

/** Garmin Training Status levels (based on VO2 max trend, acute load and HRV status). */
export const TRAINING_STATUSES = [
  "PEAKING",
  "PRODUCTIVE",
  "MAINTAINING",
  "RECOVERY",
  "UNPRODUCTIVE",
  "DETRAINING",
  "OVERREACHING",
  "STRAINED",
  "NO_STATUS",
] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

/** Garmin splits training load into three categories. */
export const LOAD_FOCUS_CATEGORIES = ["LOW_AEROBIC", "HIGH_AEROBIC", "ANAEROBIC"] as const;
export type LoadFocusCategory = (typeof LOAD_FOCUS_CATEGORIES)[number];

/** Garmin Training Load Focus feedback (4-week distribution vs. targets). */
export const LOAD_FOCUS_FEEDBACK = [
  "BELOW_TARGETS",
  "LOW_AEROBIC_SHORTAGE",
  "HIGH_AEROBIC_SHORTAGE",
  "ANAEROBIC_SHORTAGE",
  "BALANCED",
  "LOW_AEROBIC_FOCUS",
  "HIGH_AEROBIC_FOCUS",
  "ANAEROBIC_FOCUS",
  "ABOVE_TARGETS",
] as const;
export type LoadFocusFeedback = (typeof LOAD_FOCUS_FEEDBACK)[number];

/** Garmin: the impact of an activity on acute load fades over time and is gone after 10 days. */
export const ACUTE_LOAD_WINDOW_DAYS = 10;

// --- Macedonian labels for the UI ----------------------------------------------------------------

export const GARMIN_LABELS_MK = Object.freeze({
  trainingReadiness: {
    PRIME: "Врвна",
    HIGH: "Висока",
    MODERATE: "Умерена",
    LOW: "Ниска",
    POOR: "Слаба",
  } satisfies Record<TrainingReadinessLevel, string>,
  hrvStatus: {
    BALANCED: "Избалансиран",
    UNBALANCED: "Неизбалансиран",
    LOW: "Низок",
    POOR: "Слаб",
    NO_STATUS: "Нема статус",
  } satisfies Record<HrvStatus, string>,
  trainingEffect: {
    NO_BENEFIT: "Без ефект",
    MINOR: "Мал ефект",
    MAINTAINING: "Одржува",
    IMPACTING: "Подобрува",
    HIGHLY_IMPACTING: "Значително подобрува",
    OVERREACHING: "Претерување",
  } satisfies Record<TrainingEffectBenefit, string>,
  trainingStatus: {
    PEAKING: "Врв на форма",
    PRODUCTIVE: "Продуктивно",
    MAINTAINING: "Одржување",
    RECOVERY: "Опоравок",
    UNPRODUCTIVE: "Непродуктивно",
    DETRAINING: "Губење форма",
    OVERREACHING: "Претерување",
    STRAINED: "Напрегнато",
    NO_STATUS: "Нема статус",
  } satisfies Record<TrainingStatus, string>,
});

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
