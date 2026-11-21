import type { AdviceChange, BriefingAdvice, Readiness } from "@activen/domain";
import type { Formatter } from "./format.js";
import type { Translator } from "./translate.js";

/** The advice in words, the same in the app and in the morning email. */
export interface BriefingText {
  verdict: string;
  reason: string;
  /** The concrete change; null when the plan stands. */
  change: string | null;
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
    case "sleep":
      return factor?.unit === "score"
        ? t.t("briefing.reason.sleep.score", { value: value ?? "—" })
        : t.t("briefing.reason.sleep.seconds", {
            value: f.totalTime(value),
            need: f.totalTime(baseline),
          });
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
