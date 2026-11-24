import {
  resolvePace,
  type TrainingPaces,
  type StepDuration,
  type StepTarget,
  type WorkoutItem,
  type WorkoutStep,
  type WorkoutStructure,
} from "@activen/domain";
import type { Formatter } from "@activen/i18n";
import { usePaces } from "./PacesContext.js";
import { useI18n, type T } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";

export function durationText(f: Formatter, t: T, d: StepDuration): string {
  if (d.type === "open") return t("workout.open");
  if (d.type === "time") return f.duration(d.seconds);
  return d.meters < 1000 && f.unitSystem === "metric" ? `${d.meters} m` : f.distance(d.meters, 2);
}

/** "4:54–5:04 /km" for a resolved pace range, the single pace when the range is narrow. */
function paceRange(f: Formatter, low: number, high: number): string {
  return Math.abs(high - low) <= 10
    ? f.pace((low + high) / 2)
    : `${f.pace(low).split(" ")[0]}–${f.pace(high)}`;
}

/** A target in words; a named pace ("M pace") gets its numbers from the athlete's goal. */
export function targetText(
  f: Formatter,
  t: T,
  x: StepTarget,
  paces: TrainingPaces | null = null,
): string {
  switch (x.type) {
    case "pace":
      return x.low === x.high || Math.abs(x.high - x.low) <= 10
        ? f.pace((x.low + x.high) / 2)
        : `${f.pace(x.low).split(" ")[0]}–${f.pace(x.high)}`;
    case "hr_zone":
      return t("workout.zone", { zone: x.zone });
    case "label": {
      const r = resolvePace(x.text, paces);
      return r ? `${x.text} · ${paceRange(f, r.low, r.high)}` : x.text;
    }
    case "none":
      return "";
  }
}

function stepText(f: Formatter, t: T, s: WorkoutStep, paces: TrainingPaces | null): string {
  const target = targetText(f, t, s.target, paces);
  return `${durationText(f, t, s.duration)}${target ? ` @ ${target}` : ""}`;
}

/** One line: "Загревање 2 km · 6 × 1000 m @ 5K темпо / 2:00 · Смирување 6 km". */
export function workoutSummary(
  f: Formatter,
  t: T,
  s: WorkoutStructure,
  paces: TrainingPaces | null = null,
): string {
  return s.items
    .map((i) => {
      if (i.kind === "repeat") {
        const [work, ...rest] = i.steps;
        const recovery = rest.map((r) => durationText(f, t, r.duration)).join(" / ");
        return `${t("workout.repeat", { count: i.count })} ${work ? stepText(f, t, work, paces) : ""}${
          recovery ? ` / ${recovery}` : ""
        }`;
      }
      if (i.intensity === "active") return stepText(f, t, i, paces);
      return `${t(`lap.${i.intensity}`)} ${stepText(f, t, i, paces)}`;
    })
    .join(" · ");
}

function StepRow({
  step,
  onChange,
}: {
  step: WorkoutStep;
  onChange?: ((s: WorkoutStep) => void) | undefined;
}) {
  const { t, f } = useI18n();
  const paces = usePaces();
  const d = step.duration;
  const value =
    d.type === "distance"
      ? d.meters >= 1000
        ? d.meters / 1000
        : d.meters
      : d.type === "time"
        ? d.seconds >= 60
          ? d.seconds / 60
          : d.seconds
        : null;
  const unit =
    d.type === "distance"
      ? d.meters >= 1000
        ? "km"
        : "m"
      : d.type === "time"
        ? d.seconds >= 60
          ? "min"
          : "s"
        : null;
  const label = t(`lap.${step.intensity}`);
  return (
    <li className={`wstep wstep-${step.intensity}`}>
      <span className="wstep-kind">{label}</span>
      {onChange && value !== null && unit ? (
        <span className="row" style={{ gap: 6 }}>
          <input
            className="input num wstep-input"
            inputMode="decimal"
            aria-label={`${label}: ${t("workout.value")} (${t(`workout.unit.${unit}` as never)})`}
            defaultValue={String(Math.round(value * 100) / 100)}
            onBlur={(e) => {
              const v = Number(e.target.value.replace(",", "."));
              if (!Number.isFinite(v) || v <= 0) return;
              const k = unit === "km" ? 1000 : unit === "m" ? 1 : unit === "min" ? 60 : 1;
              onChange({
                ...step,
                duration:
                  d.type === "distance"
                    ? { type: "distance", meters: Math.round(v * k) }
                    : { type: "time", seconds: Math.round(v * k) },
              });
            }}
          />
          <span className="small muted">{t(`workout.unit.${unit}` as never)}</span>
        </span>
      ) : (
        <span className="num">{durationText(f, t, d)}</span>
      )}
      {step.target.type !== "none" && (
        <span className="chip teal">{targetText(f, t, step.target, paces)}</span>
      )}
    </li>
  );
}

/** The steps, repeats grouped; editable durations when `onChange` is given. */
export function WorkoutStepsView({
  structure,
  onChange,
}: {
  structure: WorkoutStructure;
  onChange?: (s: WorkoutStructure) => void;
}) {
  const { t } = useI18n();
  const replace = (index: number, item: WorkoutItem) =>
    onChange?.({
      source: "manual",
      items: structure.items.map((x, i) => (i === index ? item : x)),
    });
  return (
    <ol className="wsteps">
      {structure.items.map((item, i) =>
        item.kind === "step" ? (
          <StepRow key={i} step={item} onChange={onChange ? (s) => replace(i, s) : undefined} />
        ) : (
          <li key={i} className="wrepeat">
            <span className="wrepeat-count">
              <Icon name="swap" size={14} /> {t("workout.repeat", { count: item.count })}
            </span>
            <ol className="wsteps">
              {item.steps.map((s, j) => (
                <StepRow
                  key={j}
                  step={s}
                  onChange={
                    onChange
                      ? (next) =>
                          replace(i, {
                            ...item,
                            steps: item.steps.map((x, k) => (k === j ? next : x)),
                          })
                      : undefined
                  }
                />
              ))}
            </ol>
          </li>
        ),
      )}
    </ol>
  );
}

/** Compact steps line under a plan entry (only when a structure was accepted). */
export function StructureLine({ structure }: { structure: WorkoutStructure | null | undefined }) {
  const { t, f } = useI18n();
  const paces = usePaces();
  if (!structure) return null;
  return (
    <div className="small workout-line num" title={t("workout.structure")}>
      <Icon name="activities" size={14} /> {workoutSummary(f, t, structure, paces)}
    </div>
  );
}

/** Short step length: "1k", "1,5k", "400m", "3′", "45″" (miles: "1mi"). */
function shortDuration(f: Formatter, d: StepDuration): string {
  if (d.type === "open") return "…";
  if (d.type === "time")
    return d.seconds >= 60 && d.seconds % 60 === 0
      ? `${d.seconds / 60}′`
      : d.seconds < 60
        ? `${d.seconds}″`
        : f.duration(d.seconds);
  if (f.unitSystem === "imperial") return `${f.number(d.meters / 1609.344, 2)}mi`;
  return d.meters >= 1000 ? `${f.number(d.meters / 1000, 1)}k` : `${d.meters}m`;
}

/** Short target: "@4:30", "@Z2", "@5K темпо". */
function shortTarget(f: Formatter, t: T, x: StepTarget, paces: TrainingPaces | null): string {
  if (x.type === "none") return "";
  if (x.type === "hr_zone") return ` @Z${x.zone}`;
  if (x.type === "pace") return ` @${f.pace((x.low + x.high) / 2).split(" ")[0]}`;
  const r = resolvePace(x.text, paces);
  // "@M 4:59": the name the coach wrote and the athlete's number for it.
  return r ? ` @${r.key} ${f.pace((r.low + r.high) / 2).split(" ")[0]}` : ` @${x.text}`;
}

/**
 * The main set in one short line, without warm-up and cool-down:
 * "6×1k @5K темпо / 400m", "3×10′ @Z4 / 2′", "8k @Z2".
 */
export function mainSetText(
  f: Formatter,
  t: T,
  s: WorkoutStructure,
  paces: TrainingPaces | null = null,
): string {
  return s.items
    .map((i: WorkoutItem) => {
      if (i.kind === "repeat") {
        const [work, ...rest] = i.steps;
        if (!work) return "";
        const recovery = rest.map((r) => shortDuration(f, r.duration)).join(" + ");
        return `${i.count}×${shortDuration(f, work.duration)}${shortTarget(f, t, work.target, paces)}${
          recovery ? ` / ${recovery}` : ""
        }`;
      }
      if (i.intensity !== "active") return "";
      return `${shortDuration(f, i.duration)}${shortTarget(f, t, i.target, paces)}`;
    })
    .filter(Boolean)
    .join(" · ");
}
