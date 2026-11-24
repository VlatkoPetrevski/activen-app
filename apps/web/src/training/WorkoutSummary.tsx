import { HR_ZONE_COLORS } from "@activen/contracts";
import {
  paceKeyOf,
  resolvePace,
  workoutBlocks,
  workoutTotals,
  type TrainingPaces,
  type WorkoutStep,
  type WorkoutStructure,
} from "@activen/domain";
import type { Formatter } from "@activen/i18n";
import { useI18n, type T } from "../i18n/I18nContext.js";
import { usePaces } from "./PacesContext.js";
import { durationText, targetText, WorkoutStepsView } from "./WorkoutSteps.js";

/** The workout as one bar: a block per step, as long as its time, in its zone's color. */
export function WorkoutBar({ structure }: { structure: WorkoutStructure }) {
  const { t } = useI18n();
  const paces = usePaces();
  const blocks = workoutBlocks(structure, paces);
  if (blocks.length === 0) return null;
  return (
    <div className="workout-bar" role="img" aria-label={t("workout.bar")}>
      {blocks.map((b, i) => (
        <span
          key={i}
          className={`workout-block z${b.zone}`}
          style={{
            flexGrow: Math.max(1, b.seconds),
            background: HR_ZONE_COLORS[b.zone - 1],
            height: `${8 + b.zone * 4}px`,
          }}
        />
      ))}
    </div>
  );
}

const firstOf = (s: WorkoutStructure, intensity: WorkoutStep["intensity"]) =>
  s.items.find((i): i is WorkoutStep => i.kind === "step" && i.intensity === intensity);

/** "(5:37–6:11 /km)" for easy running when the goal gives an easy pace. */
const easyText = (f: Formatter, paces: TrainingPaces | null) =>
  paces ? ` (${f.pace(paces.paces.E[0]).split(" ")[0]}–${f.pace(paces.paces.E[1])})` : "";

/**
 * Short advice for the athlete, from the structure (no AI): how to warm up, hold the reps, recover
 * and cool down, or how easy an easy run is. Names a pace the goal does not resolve yet.
 */
export function workoutAdvice(
  f: Formatter,
  t: T,
  s: WorkoutStructure,
  paces: TrainingPaces | null,
): string[] {
  const out: string[] = [];
  const warm = firstOf(s, "warmup");
  const cool = firstOf(s, "cooldown");
  const repeat = s.items.find((i) => i.kind === "repeat");
  const easy = easyText(f, paces);
  if (warm) out.push(t("advice.warmup", { d: durationText(f, t, warm.duration), easy }));
  if (repeat && repeat.kind === "repeat") {
    const [work, recovery] = repeat.steps;
    if (work) {
      const target = targetText(f, t, work.target, paces);
      out.push(
        t(target ? "advice.reps" : "advice.repsNoTarget", {
          count: repeat.count,
          d: durationText(f, t, work.duration),
          target,
        }),
      );
      if (work.target.type === "label" && paceKeyOf(work.target.text) && !paces)
        out.push(t("advice.noGoal", { label: work.target.text }));
    }
    if (recovery) out.push(t("advice.recovery", { d: durationText(f, t, recovery.duration) }));
  } else {
    const main = s.items.find(
      (i): i is WorkoutStep => i.kind === "step" && i.intensity === "active",
    );
    if (main) {
      const t2 = main.target;
      const isEasy =
        (t2.type === "hr_zone" && t2.zone <= 2) ||
        (t2.type === "label" && paceKeyOf(t2.text) === "E");
      if (isEasy) out.push(t("advice.easy", { easy }));
      else if (t2.type !== "none") {
        const r = t2.type === "label" ? resolvePace(t2.text, paces) : null;
        out.push(
          t("advice.steady", {
            d: durationText(f, t, main.duration),
            target: targetText(f, t, t2, paces),
          }),
        );
        if (t2.type === "label" && paceKeyOf(t2.text) && !r)
          out.push(t("advice.noGoal", { label: t2.text }));
      }
    }
  }
  if (cool) out.push(t("advice.cooldown", { d: durationText(f, t, cool.duration) }));
  return out;
}

/**
 * Under the description: the bar, the steps (editable when `onChange` is given), the totals the
 * plan uses as distance and time, and the advice the athlete reads.
 */
export function WorkoutSummary({
  structure,
  onChange,
}: {
  structure: WorkoutStructure;
  onChange?: ((s: WorkoutStructure) => void) | undefined;
}) {
  const { t, f } = useI18n();
  const paces = usePaces();
  const total = workoutTotals(structure, paces);
  const advice = workoutAdvice(f, t, structure, paces);
  return (
    <div className="workout-summary stack-s">
      <WorkoutBar structure={structure} />
      <WorkoutStepsView structure={structure} {...(onChange ? { onChange } : {})} />
      <div className="row wrap small num workout-totals">
        <strong>
          {total.estimated ? "≈ " : ""}
          {f.distance(total.meters, 1)} · {f.totalTime(total.seconds)}
        </strong>
        <span className="muted">{paces ? t("workout.totalsGoal") : t("workout.totalsNoGoal")}</span>
      </div>
      {advice.length > 0 && (
        <div className="workout-advice small">
          <span className="eyebrow">{t("workout.advice")}</span>
          <p>{advice.join(" ")}</p>
        </div>
      )}
    </div>
  );
}
