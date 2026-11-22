/**
 * The morning briefing, assembled the same way by the API and the in-browser demo: merged
 * wellness → ActiveN readiness → advice for today's first session.
 */
import {
  addDays,
  BASELINE_DAYS,
  briefingAdvice,
  computeReadiness,
  hrvStatus,
  mergeWellness,
  type Activity,
  type BriefingAdvice,
  type LocalDate,
  type Readiness,
  type Vendor,
  type WellnessDay,
  type WellnessRecord,
} from "@activen/domain";
import type { PlanEntryDto, WellnessDto } from "./responses.js";
import type { Viewer } from "./viewer.js";

/** What the athlete entered this morning: sleep (a range), how the night was, resting pulse. */
export interface MorningInputDto {
  /** The middle of the chosen range (see {@link SLEEP_RANGES}). */
  sleepDurationInSeconds: number | null;
  /** 1 (very poor) – 5 (excellent). */
  sleepQuality: number | null;
  restingHeartRate: number | null;
}

/** Sleep is entered as a range; the ranges live in the domain with the readiness rules. */
export { SLEEP_RANGES, sleepRangeIndex } from "@activen/domain";

export interface BriefingDto {
  athleteId: string;
  calendarDate: LocalDate;
  readiness: Readiness;
  advice: BriefingAdvice;
  /** Today's first workout, or the rest day; null when nothing is planned. */
  planEntry: PlanEntryDto | null;
  /** Today's values merged across sources (each value keeps its source); null without data. */
  today: WellnessDay | null;
  morningInput: MorningInputDto | null;
}

/** Days of wellness and activities the briefing needs before the assessed morning. */
export const BRIEFING_HISTORY_DAYS = BASELINE_DAYS;

export interface BriefingInput {
  athleteId: string;
  calendarDate: LocalDate;
  /** Every source's records for [calendarDate − 28, calendarDate]. */
  records: readonly WellnessRecord[];
  priority: readonly Vendor[];
  /** Merged activities of the last 28 days (any later ones are ignored). */
  activities: readonly Activity[];
  /** Plan entries of the day. */
  entries: readonly PlanEntryDto[];
  sleepNeedMinutes: number;
  /**
   * Who is looking. A coach without the "activities" consent sees that training load counted,
   * not the ratio itself.
   */
  viewer?: Pick<Viewer, "activities">;
}

/** The session the advice is about: the first workout of the day, else a planned rest. */
export function sessionOfTheDay(entries: readonly PlanEntryDto[]): PlanEntryDto | null {
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  return sorted.find((e) => e.kind === "workout") ?? sorted.find((e) => e.kind === "rest") ?? null;
}

export function buildBriefing(input: BriefingInput): BriefingDto {
  const wellness = mergeWellness(input.records, input.priority);
  const readiness = computeReadiness({
    calendarDate: input.calendarDate,
    wellness,
    activities: input.activities,
    sleepNeedSeconds: input.sleepNeedMinutes * 60,
  });
  const planEntry = sessionOfTheDay(
    input.entries.filter((e) => e.calendarDate === input.calendarDate),
  );
  if (input.viewer && !input.viewer.activities)
    readiness.factors = readiness.factors.map((f) =>
      f.key === "load" ? { ...f, value: null, baseline: null } : f,
    );
  const manual = input.records.find(
    (r) => r.calendarDate === input.calendarDate && r.source === "manual",
  );
  return {
    athleteId: input.athleteId,
    calendarDate: input.calendarDate,
    readiness,
    advice: briefingAdvice(readiness, planEntry),
    planEntry,
    today: wellness.find((d) => d.calendarDate === input.calendarDate) ?? null,
    morningInput: manual
      ? {
          sleepDurationInSeconds: manual.sleepDurationInSeconds,
          sleepQuality: manual.sleepQuality,
          restingHeartRate: manual.restingHeartRate,
        }
      : null,
  };
}

const HRV_STATUS: Record<ReturnType<typeof hrvStatus>["status"], WellnessDto["hrvStatus"]> = {
  BALANCED: "balanced",
  UNBALANCED: "unbalanced",
  LOW: "low",
  POOR: "poor",
  NO_STATUS: "none",
};

/**
 * Daily wellness for charts (coach analytics): each day's merged values with ActiveN readiness
 * as `trainingReadiness` and the Garmin-style HRV status when there is enough history.
 * `records` and `activities` must reach 28 days before `from`.
 */
export function wellnessSeries(input: {
  from: LocalDate;
  to: LocalDate;
  records: readonly WellnessRecord[];
  priority: readonly Vendor[];
  activities: readonly Activity[];
  sleepNeedMinutes: number;
}): WellnessDto[] {
  const days = mergeWellness(input.records, input.priority);
  return days
    .filter((d) => d.calendarDate >= input.from && d.calendarDate <= input.to)
    .map((d) => {
      const r = computeReadiness({
        calendarDate: d.calendarDate,
        wellness: days,
        activities: input.activities,
        sleepNeedSeconds: input.sleepNeedMinutes * 60,
      });
      const hrvOf = (from: LocalDate) =>
        days
          .filter((x) => x.calendarDate > from && x.calendarDate <= d.calendarDate)
          .flatMap((x) => (x.lastNightHrvMs == null ? [] : [x.lastNightHrvMs]));
      const history = hrvOf(addDays(d.calendarDate, -BASELINE_DAYS));
      const mean = history.reduce((s, x) => s + x, 0) / Math.max(1, history.length);
      const sd = Math.sqrt(
        history.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, history.length - 1),
      );
      const width = Math.max(sd, mean * 0.05, 1);
      const status = hrvStatus({
        lastSevenNights: hrvOf(addDays(d.calendarDate, -7)),
        historyNights: history.length,
        baselineLow: mean - width,
        baselineHigh: mean + width,
      }).status;
      return {
        calendarDate: d.calendarDate,
        trainingReadiness: r.score,
        hrvStatus: HRV_STATUS[status],
        lastNightHrvMs: d.lastNightHrvMs,
        sleepScore: d.sleepScore,
        sleepDurationInSeconds: d.sleepDurationInSeconds,
        restingHeartRate: d.restingHeartRate,
        recoveryTimeInMinutes: null,
      };
    });
}

/** Demo and seed data use `WellnessDto`; this turns it back into a vendor's records. */
export function wellnessRecordsOf(list: readonly WellnessDto[], source: Vendor): WellnessRecord[] {
  return list.map((w) => ({
    calendarDate: w.calendarDate,
    source,
    sleepDurationInSeconds: w.sleepDurationInSeconds,
    sleepScore: w.sleepScore,
    sleepQuality: null,
    restingHeartRate: w.restingHeartRate,
    lastNightHrvMs: w.lastNightHrvMs,
    vendorReadiness: w.trainingReadiness,
  }));
}
