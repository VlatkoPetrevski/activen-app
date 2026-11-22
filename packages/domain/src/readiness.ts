/**
 * Morning readiness and the briefing advice (increment 7).
 *
 * ActiveN computes its own readiness from *measured* data only — no subjective self-assessment:
 *
 *   sleep       last night's sleep score (vendor) or, without one, duration vs. the sleep need
 *   restingHr   this morning's resting heart rate vs. the athlete's own 28-day median
 *   hrv         last night's HRV vs. the athlete's own baseline (mean ± SD), when a source has it
 *   load        acute:chronic training load (7 days vs. the 28-day weekly average)
 *
 * Every factor is scored 0–100, weighted, and the weights are renormalised over the factors that
 * have data. The result is transparent: the UI shows each factor, its value and baseline. A single
 * very poor factor (score < 25) caps readiness at 49 (LOW), so a 4-hour night is never hidden by a
 * good load ratio; two very poor factors cap it at 24 (POOR, rest). Levels reuse the Garmin bands
 * (`trainingReadinessLevel`).
 */
import { addDays } from "./dates.js";
import { trainingReadinessLevel, type TrainingReadinessLevel } from "./garmin-metrics.js";
import type { Activity, LocalDate, PlanEntry, Vendor } from "./types.js";
import { flattenWorkout, type WorkoutItem, type WorkoutStructure } from "./workout.js";

// --- Daily wellness ------------------------------------------------------------------------------

/** Where a daily value came from: a connected vendor, or "manual" (typed in the morning). */
export type WellnessSource = Vendor;

/** One day of recovery data from one source. All fields optional: sources deliver what they have. */
export interface WellnessRecord {
  calendarDate: LocalDate;
  source: WellnessSource;
  sleepDurationInSeconds: number | null;
  /** 0–100 (Garmin sleep score, Polar sleep score). */
  sleepScore: number | null;
  /** How the athlete rated the night, 1 (very poor) – 5 (excellent); typed in the morning. */
  sleepQuality: number | null;
  restingHeartRate: number | null;
  /** Nightly HRV, RMSSD in ms. */
  lastNightHrvMs: number | null;
  /** The vendor's own readiness (Garmin Training Readiness, Polar Nightly Recharge), 1–100. */
  vendorReadiness: number | null;
}

export type WellnessField = Exclude<keyof WellnessRecord, "calendarDate" | "source">;

export const WELLNESS_FIELDS: readonly WellnessField[] = Object.freeze([
  "sleepDurationInSeconds",
  "sleepScore",
  "sleepQuality",
  "restingHeartRate",
  "lastNightHrvMs",
  "vendorReadiness",
]);

/** A day's values merged across sources, with the source of every value kept. */
export interface WellnessDay {
  calendarDate: LocalDate;
  sleepDurationInSeconds: number | null;
  sleepScore: number | null;
  sleepQuality: number | null;
  restingHeartRate: number | null;
  lastNightHrvMs: number | null;
  vendorReadiness: number | null;
  sources: Partial<Record<WellnessField, WellnessSource>>;
}

/**
 * Merges records field by field: vendors in the athlete's source priority, then any other
 * vendor, and last what the athlete entered in the morning (it only fills what no device has).
 */
export function mergeWellness(
  records: readonly WellnessRecord[],
  priority: readonly Vendor[] = [],
): WellnessDay[] {
  const rank = (s: WellnessSource) => {
    if (s === "manual") return priority.length + 1;
    const i = priority.indexOf(s);
    return i === -1 ? priority.length : i;
  };
  const byDate = new Map<LocalDate, WellnessRecord[]>();
  for (const r of records) byDate.set(r.calendarDate, [...(byDate.get(r.calendarDate) ?? []), r]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([calendarDate, list]) => {
      const ordered = [...list].sort((a, b) => rank(a.source) - rank(b.source));
      const day: WellnessDay = {
        calendarDate,
        sleepDurationInSeconds: null,
        sleepScore: null,
        sleepQuality: null,
        restingHeartRate: null,
        lastNightHrvMs: null,
        vendorReadiness: null,
        sources: {},
      };
      for (const field of WELLNESS_FIELDS) {
        const from = ordered.find((r) => r[field] !== null);
        if (from) {
          day[field] = from[field];
          day.sources[field] = from.source;
        }
      }
      return day;
    });
}

// --- Readiness -----------------------------------------------------------------------------------

export const READINESS_FACTORS = ["sleep", "hrv", "restingHr", "load"] as const;
export type ReadinessFactorKey = (typeof READINESS_FACTORS)[number];

/** Relative weights; renormalised over the factors that have data. */
export const READINESS_WEIGHTS: Readonly<Record<ReadinessFactorKey, number>> = Object.freeze({
  sleep: 0.35,
  hrv: 0.25,
  restingHr: 0.2,
  load: 0.2,
});

/** Default nightly sleep need when the athlete has not set one. */
export const DEFAULT_SLEEP_NEED_SECONDS = 8 * 3600;
/** Resting-HR baseline: median of up to this many earlier mornings… */
export const BASELINE_DAYS = 28;
/** …and at least this many mornings before a baseline is used. */
export const MIN_BASELINE_VALUES = 5;
/** Below this a factor caps readiness at {@link POOR_FACTOR_CAP}. */
export const POOR_FACTOR_SCORE = 25;
export const POOR_FACTOR_CAP = 49;
/** Two or more very poor factors cap readiness here (rest). */
export const POOR_FACTORS_CAP = 24;

export type FactorStatus = "good" | "fair" | "poor" | "missing";

export interface ReadinessFactor {
  key: ReadinessFactorKey;
  status: FactorStatus;
  /** 0–100, null when missing. */
  score: number | null;
  /**
   * The measured value: sleep → seconds (or score when `unit` is "score"), restingHr → bpm,
   * hrv → ms, load → acute:chronic ratio.
   */
  value: number | null;
  /** What the value is compared with (sleep need, baseline median/mean, 1.0 for load). */
  baseline: number | null;
  unit: "seconds" | "score" | "bpm" | "ms" | "ratio";
  /** Sleep only: the athlete's own rating of the night (1–5), when given. */
  quality?: number | null;
  /** Sleep only: the duration is a range the athlete chose (see {@link SLEEP_RANGES}). */
  typed?: boolean;
}

export type ReadinessConfidence = "high" | "medium" | "low" | "none";

export interface Readiness {
  calendarDate: LocalDate;
  /** 1–100, null when there is no data at all. */
  score: number | null;
  level: TrainingReadinessLevel | null;
  confidence: ReadinessConfidence;
  factors: ReadinessFactor[];
  /** Vendor's own readiness for the day, shown next to ActiveN's for reference. */
  vendorReadiness: number | null;
}

export interface ReadinessInput {
  /** The morning being assessed. */
  calendarDate: LocalDate;
  /** Merged wellness for that morning and earlier days (any order; later days are ignored). */
  wellness: readonly WellnessDay[];
  /** Activities up to and including the day before (later ones are ignored). */
  activities: readonly Pick<
    Activity,
    "calendarDate" | "trainingLoad" | "durationInSeconds" | "movingDurationInSeconds" | "deleted"
  >[];
  sleepNeedSeconds?: number;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const statusOf = (score: number): FactorStatus =>
  score >= 70 ? "good" : score >= 40 ? "fair" : "poor";

/** Linear interpolation through (x, y) points sorted by x; flat beyond the ends. */
function piecewise(x: number, points: readonly (readonly [number, number])[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return last[1];
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function meanSd(xs: readonly number[]): { mean: number; sd: number } {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

const missing = (key: ReadinessFactorKey, unit: ReadinessFactor["unit"]): ReadinessFactor => ({
  key,
  status: "missing",
  score: null,
  value: null,
  baseline: null,
  unit,
});

function factor(
  key: ReadinessFactorKey,
  unit: ReadinessFactor["unit"],
  rawScore: number,
  value: number,
  baseline: number | null,
): ReadinessFactor {
  const score = Math.round(clamp(rawScore));
  return { key, status: statusOf(score), score, value, baseline, unit };
}

/**
 * Sleep is estimated as a range ("6–7 h"), not typed to the minute. Each range is stored as its
 * middle; the last range is open-ended.
 */
export const SLEEP_RANGES: readonly { from: number; to: number | null; seconds: number }[] =
  Object.freeze([
    { from: 0, to: 5, seconds: 4.5 * 3600 },
    { from: 5, to: 6, seconds: 5.5 * 3600 },
    { from: 6, to: 7, seconds: 6.5 * 3600 },
    { from: 7, to: 8, seconds: 7.5 * 3600 },
    { from: 8, to: 9, seconds: 8.5 * 3600 },
    { from: 9, to: null, seconds: 9.5 * 3600 },
  ]);

/** The range a duration falls in (index into {@link SLEEP_RANGES}); null without a duration. */
export function sleepRangeIndex(seconds: number | null): number | null {
  if (seconds === null) return null;
  const hours = seconds / 3600;
  const i = SLEEP_RANGES.findIndex((r) => hours >= r.from && (r.to === null || hours < r.to));
  return i === -1 ? null : i;
}

/** The athlete's rating of the night (1–5) as a 0–100 score. */
export const SLEEP_QUALITY_SCORE: Readonly<Record<number, number>> = Object.freeze({
  1: 10,
  2: 35,
  3: 60,
  4: 80,
  5: 100,
});

/**
 * Sleep: the device's sleep score when present, otherwise duration vs. need (half the need → 0).
 * Only without a night from a device does what the athlete entered count: the duration range
 * and the rating of the night, averaged when both are given.
 */
export function sleepFactor(day: WellnessDay | undefined, needSeconds: number): ReadinessFactor {
  const fromDevice = (field: "sleepScore" | "sleepDurationInSeconds") =>
    day?.[field] != null && day.sources[field] !== "manual";
  // The watch recorded the night: its score (or duration) is the night; nothing typed counts.
  if (fromDevice("sleepScore") && day?.sleepScore != null)
    return factor("sleep", "score", day.sleepScore, day.sleepScore, null);
  const watchNight = fromDevice("sleepDurationInSeconds");
  const d = day?.sleepDurationInSeconds;
  const q = watchNight ? null : (day?.sleepQuality ?? null);
  const qualityScore = q === null ? null : (SLEEP_QUALITY_SCORE[Math.round(q)] ?? null);
  const durationScore = d == null || d <= 0 ? null : ((d / needSeconds - 0.5) / 0.5) * 100;
  if (durationScore === null && qualityScore === null) return missing("sleep", "seconds");
  const scores = [durationScore, qualityScore].filter((x): x is number => x !== null);
  const score = scores.reduce((sum, x) => sum + Math.min(100, Math.max(0, x)), 0) / scores.length;
  return {
    ...factor("sleep", "seconds", score, d != null && d > 0 ? d : 0, needSeconds),
    ...(durationScore === null ? { value: null } : {}),
    quality: q,
    typed: day?.sources.sleepDurationInSeconds === "manual",
  };
}

/** Resting HR above the athlete's median: +0 → 100, +3 → 75, +6 → 40, +10 → 0. Lower is fine. */
export function restingHrFactor(today: number | null, history: readonly number[]): ReadinessFactor {
  if (today == null || history.length < MIN_BASELINE_VALUES) return missing("restingHr", "bpm");
  const base = median(history);
  const delta = today - base;
  const score = piecewise(delta, [
    [0, 100],
    [3, 75],
    [6, 40],
    [10, 0],
  ]);
  return factor("restingHr", "bpm", score, today, Math.round(base));
}

/** HRV vs. own baseline in standard deviations: at or above → 100, −1 SD → 65, −2 SD → 25. */
export function hrvFactor(today: number | null, history: readonly number[]): ReadinessFactor {
  if (today == null || history.length < MIN_BASELINE_VALUES) return missing("hrv", "ms");
  const { mean, sd } = meanSd(history);
  // A very stable history would make tiny dips look dramatic; use at least 5 % of the mean.
  const z = (today - mean) / Math.max(sd, mean * 0.05, 1);
  const score = piecewise(z, [
    [-2.5, 0],
    [-2, 25],
    [-1, 65],
    [0, 100],
  ]);
  return factor("hrv", "ms", score, today, Math.round(mean));
}

/**
 * Acute:chronic workload ratio. Load per activity is the device's training load when every
 * activity in the window has one; otherwise minutes of moving time (consistent, unit-free ratio).
 */
export function loadFactor(
  calendarDate: LocalDate,
  activities: ReadinessInput["activities"],
): ReadinessFactor {
  const from = addDays(calendarDate, -BASELINE_DAYS);
  const window = activities.filter(
    (a) => !a.deleted && a.calendarDate >= from && a.calendarDate < calendarDate,
  );
  if (window.length === 0) return missing("load", "ratio");
  const useLoad = window.every((a) => a.trainingLoad != null && a.trainingLoad > 0);
  const loadOf = (a: (typeof window)[number]) =>
    useLoad ? (a.trainingLoad ?? 0) : (a.movingDurationInSeconds ?? a.durationInSeconds) / 60;
  const acuteFrom = addDays(calendarDate, -7);
  const acute = window
    .filter((a) => a.calendarDate >= acuteFrom)
    .reduce((s, a) => s + loadOf(a), 0);
  const chronicWeekly = window.reduce((s, a) => s + loadOf(a), 0) / (BASELINE_DAYS / 7);
  if (chronicWeekly <= 0) return missing("load", "ratio");
  const ratio = Math.round((acute / chronicWeekly) * 100) / 100;
  const score = piecewise(ratio, [
    [1.0, 100],
    [1.3, 75],
    [1.5, 45],
    [2.0, 0],
  ]);
  return factor("load", "ratio", score, ratio, 1);
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const need = input.sleepNeedSeconds ?? DEFAULT_SLEEP_NEED_SECONDS;
  const today = input.wellness.find((d) => d.calendarDate === input.calendarDate);
  const from = addDays(input.calendarDate, -BASELINE_DAYS);
  const earlier = input.wellness.filter(
    (d) => d.calendarDate >= from && d.calendarDate < input.calendarDate,
  );
  const series = (pick: (d: WellnessDay) => number | null) =>
    earlier.map(pick).filter((v): v is number => v != null && v > 0);

  const factors: ReadinessFactor[] = [
    sleepFactor(today, need),
    hrvFactor(
      today?.lastNightHrvMs ?? null,
      series((d) => d.lastNightHrvMs),
    ),
    restingHrFactor(
      today?.restingHeartRate ?? null,
      series((d) => d.restingHeartRate),
    ),
    loadFactor(input.calendarDate, input.activities),
  ];
  const present = factors.filter((f) => f.score != null);
  const vendorReadiness = today?.vendorReadiness ?? null;
  const physiological = present.filter((f) => f.key !== "load").length;
  if (physiological === 0) {
    // Training load alone says nothing about how the athlete slept or recovered.
    return {
      calendarDate: input.calendarDate,
      score: null,
      level: null,
      confidence: "none",
      factors,
      vendorReadiness,
    };
  }
  const weight = present.reduce((s, f) => s + READINESS_WEIGHTS[f.key], 0);
  let score = present.reduce((s, f) => s + (f.score ?? 0) * READINESS_WEIGHTS[f.key], 0) / weight;
  const poor = present.filter((f) => (f.score ?? 100) < POOR_FACTOR_SCORE).length;
  if (poor >= 2) score = Math.min(score, POOR_FACTORS_CAP);
  else if (poor === 1) score = Math.min(score, POOR_FACTOR_CAP);
  const rounded = Math.round(clamp(score, 1, 100));
  return {
    calendarDate: input.calendarDate,
    score: rounded,
    level: trainingReadinessLevel(rounded),
    confidence: present.length >= 3 ? "high" : present.length === 2 ? "medium" : "low",
    factors,
    vendorReadiness,
  };
}

// --- Session intensity ---------------------------------------------------------------------------

export type SessionIntensity = "rest" | "easy" | "long" | "hard";

/** Long-session thresholds. */
export const LONG_SESSION_METERS = 18_000;
export const LONG_SESSION_SECONDS = 90 * 60;

const HARD_WORDS =
  /(темпо|tempo|интервал|interval|фартлек|fartlek|брзо|fast|threshold|праг|трка|race|vo2|спринт|sprint|\d+\s*k\s*pace|\d+\s*к\s*темпо|repeats?|повторувањ|\d+\s*[×xх*]\s*\d)/iu;

function hasHardBlock(structure: WorkoutStructure): boolean {
  return structure.items.some(
    (i) =>
      i.kind === "repeat" ||
      (i.intensity === "active" &&
        (i.target.type === "pace" || (i.target.type === "hr_zone" && i.target.zone >= 4))),
  );
}

/** How demanding a planned session is, from its structure, text and size. */
export function sessionIntensity(
  entry: Pick<
    PlanEntry,
    "kind" | "description" | "plannedDistanceInMeters" | "plannedDurationInSeconds" | "structure"
  >,
): SessionIntensity {
  if (entry.kind === "rest") return "rest";
  if ((entry.structure && hasHardBlock(entry.structure)) || HARD_WORDS.test(entry.description))
    return "hard";
  if (
    (entry.plannedDistanceInMeters ?? 0) >= LONG_SESSION_METERS ||
    (entry.plannedDurationInSeconds ?? 0) >= LONG_SESSION_SECONDS
  )
    return "long";
  return "easy";
}

// --- Advice --------------------------------------------------------------------------------------

export type BriefingVerdict = "as_planned" | "ease_off" | "swap_easy" | "rest";

export type AdviceChange =
  /** Fewer repeats of the main block. */
  | { type: "fewer_repeats"; from: number; to: number }
  /** Shorter session; distance and/or duration. */
  | {
      type: "shorten";
      fromMeters: number | null;
      toMeters: number | null;
      fromSeconds: number | null;
      toSeconds: number | null;
    }
  /** Run the session easy (zone 2), at most the given size. */
  | { type: "easy_instead"; toMeters: number | null; toSeconds: number | null; zone: 2 }
  /** Take the day off (or at most a short walk / mobility). */
  | { type: "rest_day" };

/** Why: the weakest measured factor, or the overall picture. */
export type AdviceReason =
  | { kind: "factor"; factor: ReadinessFactorKey; status: FactorStatus }
  | { kind: "all_good" }
  | { kind: "no_data" }
  | { kind: "rest_planned" }
  | { kind: "nothing_planned" };

export interface BriefingAdvice {
  verdict: BriefingVerdict;
  intensity: SessionIntensity | null;
  reason: AdviceReason;
  change: AdviceChange | null;
  /** Coach signal: low readiness on a hard or long day. */
  needsAttention: boolean;
}

const roundMeters = (m: number) => Math.max(1000, Math.round(m / 500) * 500);
const roundSeconds = (s: number) => Math.max(15 * 60, Math.round(s / 300) * 300);

function mainRepeat(structure: WorkoutStructure | null | undefined) {
  return structure?.items.find(
    (i): i is Extract<WorkoutItem, { kind: "repeat" }> => i.kind === "repeat" && i.count >= 2,
  );
}

function shorten(
  entry: Pick<PlanEntry, "plannedDistanceInMeters" | "plannedDurationInSeconds">,
  factor: number,
): AdviceChange | null {
  const m = entry.plannedDistanceInMeters;
  const s = entry.plannedDurationInSeconds;
  if (m == null && s == null) return null;
  return {
    type: "shorten",
    fromMeters: m,
    toMeters: m == null ? null : roundMeters(m * factor),
    fromSeconds: s,
    toSeconds: s == null ? null : roundSeconds(s * factor),
  };
}

function easyInstead(
  entry: Pick<PlanEntry, "plannedDistanceInMeters" | "plannedDurationInSeconds" | "structure">,
  factor: number,
): AdviceChange {
  let m = entry.plannedDistanceInMeters;
  if (m == null && entry.structure) {
    const total = flattenWorkout(entry.structure).reduce(
      (sum, st) => sum + (st.duration.type === "distance" ? st.duration.meters : 0),
      0,
    );
    m = total > 0 ? total : null;
  }
  const s = entry.plannedDurationInSeconds;
  return {
    type: "easy_instead",
    toMeters: m == null ? null : roundMeters(m * factor),
    toSeconds: s == null ? null : roundSeconds(s * factor),
    zone: 2,
  };
}

function weakest(readiness: Readiness): AdviceReason {
  const scored = readiness.factors.filter((f) => f.score != null);
  const worst = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  return worst && worst.status !== "good"
    ? { kind: "factor", factor: worst.key, status: worst.status }
    : { kind: "all_good" };
}

/**
 * The morning advice for today's planned session (the first workout of the day when there are
 * several). Deterministic so the athlete and the coach see the same thing.
 *
 *            easy                long                 hard
 *   ≥ 75     as planned          as planned           as planned
 *   50–74    as planned          ease off (−20 %)     ease off (⅔ repeats or −20 %)
 *   25–49    ease off (−25 %)    easy instead (70 %)  easy instead (70 %)
 *   < 25     rest                rest                 rest
 */
export function briefingAdvice(
  readiness: Readiness,
  entry: Pick<
    PlanEntry,
    "kind" | "description" | "plannedDistanceInMeters" | "plannedDurationInSeconds" | "structure"
  > | null,
): BriefingAdvice {
  const intensity = entry ? sessionIntensity(entry) : null;
  const base = { intensity, needsAttention: false };
  if (intensity === "rest")
    return { ...base, verdict: "as_planned", reason: { kind: "rest_planned" }, change: null };
  if (readiness.score == null)
    return { ...base, verdict: "as_planned", reason: { kind: "no_data" }, change: null };
  const reason = weakest(readiness);
  if (!entry || intensity === null) {
    const verdict: BriefingVerdict =
      readiness.score < 25 ? "rest" : readiness.score < 50 ? "ease_off" : "as_planned";
    return {
      ...base,
      verdict,
      reason: verdict === "as_planned" ? { kind: "nothing_planned" } : reason,
      change: null,
    };
  }
  const score = readiness.score;
  const demanding = intensity === "hard" || intensity === "long";
  if (score >= 75 || (score >= 50 && intensity === "easy"))
    return { ...base, verdict: "as_planned", reason, change: null };
  if (score < 25)
    return {
      verdict: "rest",
      intensity,
      reason,
      change: { type: "rest_day" },
      needsAttention: demanding,
    };
  if (score < 50) {
    if (intensity === "easy")
      return { ...base, verdict: "ease_off", reason, change: shorten(entry, 0.75) };
    return {
      verdict: "swap_easy",
      intensity,
      reason,
      change: easyInstead(entry, 0.7),
      needsAttention: true,
    };
  }
  // 50–74, long or hard
  const repeat = intensity === "hard" ? mainRepeat(entry.structure) : undefined;
  const change: AdviceChange | null = repeat
    ? {
        type: "fewer_repeats",
        from: repeat.count,
        to: Math.max(1, Math.round((repeat.count * 2) / 3)),
      }
    : shorten(entry, 0.8);
  return { ...base, verdict: "ease_off", reason, change };
}
