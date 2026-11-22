import {
  SLEEP_RANGES,
  sleepRangeIndex,
  type AdviceChange,
  type BriefingAdvice,
  type Readiness,
} from "@activen/domain";
import type { Formatter } from "./format.js";
import type { Translator } from "./translate.js";

/** The advice in words, the same in the app and in the morning email. */
export interface BriefingText {
  verdict: string;
  reason: string;
  /** The concrete change; null when the plan stands. */
  change: string | null;
}

const SLEEP_QUALITY_KEYS = [
  "briefing.sleepQuality.1",
  "briefing.sleepQuality.2",
  "briefing.sleepQuality.3",
  "briefing.sleepQuality.4",
  "briefing.sleepQuality.5",
] as const;

/** Message key of the athlete's rating of the night (1–5). */
export function sleepQualityKey(quality: number): (typeof SLEEP_QUALITY_KEYS)[number] {
  return (
    SLEEP_QUALITY_KEYS[Math.min(4, Math.max(0, Math.round(quality) - 1))] ?? SLEEP_QUALITY_KEYS[2]
  );
}

/** A sleep range as the athlete chose it: "under 5 h", "6–7 h", "9+ h". */
export function sleepRangeText(t: Translator, index: number): string {
  const r = SLEEP_RANGES[index];
  if (!r) return "";
  if (r.from === 0) return t.t("briefing.morning.under", { to: r.to ?? 0 });
  if (r.to === null) return t.t("briefing.morning.over", { from: r.from });
  return t.t("briefing.morning.range", { from: r.from, to: r.to });
}

/** A sleep duration: the chosen range when typed in, else the measured time. */
export function sleepDurationText(
  t: Translator,
  f: Formatter,
  seconds: number | null,
  typed: boolean,
): string {
  const i = typed ? sleepRangeIndex(seconds) : null;
  return i === null ? f.totalTime(seconds) : sleepRangeText(t, i);
}

export function changeText(t: Translator, f: Formatter, change: AdviceChange): string {
  switch (change.type) {
    case "fewer_repeats":
      return t.t("briefing.change.fewer_repeats", { from: change.from, to: change.to });
    case "shorten":
      return change.fromMeters !== null && change.toMeters !== null
        ? t.t("briefing.change.shorten", {
            from: f.distance(change.fromMeters, 1),
            to: f.distance(change.toMeters, 1),
          })
        : t.t("briefing.change.shorten", {
            from: f.totalTime(change.fromSeconds),
            to: f.totalTime(change.toSeconds),
          });
    case "easy_instead": {
      const size =
        change.toMeters !== null
          ? f.distance(change.toMeters, 1)
          : change.toSeconds !== null
            ? f.totalTime(change.toSeconds)
            : null;
      return size === null
        ? t.t("briefing.change.easy_instead.open")
        : t.t("briefing.change.easy_instead", { size });
    }
    case "rest_day":
      return t.t("briefing.change.rest_day");
  }
}

export function reasonText(
  t: Translator,
  f: Formatter,
  readiness: Readiness,
  advice: BriefingAdvice,
): string {
  const r = advice.reason;
  if (r.kind !== "factor") return t.t(`briefing.reason.${r.kind}`);
  const factor = readiness.factors.find((x) => x.key === r.factor);
  const value = factor?.value ?? null;
  const baseline = factor?.baseline ?? null;
  switch (r.factor) {
    case "sleep": {
      const q = factor?.quality;
      const quality = q ? t.t(sleepQualityKey(q)) : null;
      if (factor?.unit === "score")
        return t.t("briefing.reason.sleep.score", { value: value ?? "—" });
      if (quality && value === null) return t.t("briefing.reason.sleep.quality", { quality });
      const slept = sleepDurationText(t, f, value, factor?.typed ?? false);
      if (quality) return t.t("briefing.reason.sleep.typed", { value: slept, quality });
      return t.t("briefing.reason.sleep.seconds", {
        value: slept,
        need: f.totalTime(baseline),
      });
    }
    case "restingHr":
      return t.t("briefing.reason.restingHr", {
        value: value ?? "—",
        baseline: baseline ?? "—",
        delta: value !== null && baseline !== null ? `+${Math.round(value - baseline)}` : "—",
      });
    case "hrv":
      return t.t("briefing.reason.hrv", {
        value: value === null ? "—" : f.number(value, 0),
        baseline: baseline ?? "—",
      });
    case "load":
      return value === null
        ? t.t("briefing.reason.loadHigh")
        : t.t("briefing.reason.load", { ratio: f.number(value, 1) });
  }
}

export function briefingText(
  t: Translator,
  f: Formatter,
  readiness: Readiness,
  advice: BriefingAdvice,
): BriefingText {
  return {
    verdict: t.t(`briefing.verdict.${advice.verdict}`),
    reason: reasonText(t, f, readiness, advice),
    change: advice.change ? changeText(t, f, advice.change) : null,
  };
}
