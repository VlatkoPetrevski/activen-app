import type { GoalDto } from "@activen/contracts";
import { goalPaces, parseGoal, type LocalDate, type TrainingPaces } from "@activen/domain";
import { useId, useState, type FormEvent } from "react";
import type { GoalInput } from "../api/api.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";

const PACE_ORDER = ["M", "HM", "T", "10K", "5K", "I", "R"] as const;
const RACE_ORDER = ["5k", "10k", "half", "marathon"] as const;

/** The paces of a goal as chips: E as a range, the rest one number each. */
function PaceChips({ paces }: { paces: TrainingPaces }) {
  const { t, f } = useI18n();
  const p = paces.paces;
  const short = (s: number) => f.pace(s).split(" ")[0];
  return (
    <ul className="pace-chips" aria-label={t("goal.paces")}>
      <li>
        <span className="pace-key">E</span>
        <span className="num">
          {short(p.E[0])}–{short(p.E[1])}
        </span>
      </li>
      {PACE_ORDER.map((k) => (
        <li key={k}>
          <span className="pace-key">{k}</span>
          <span className="num">{short(p[k])}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The athlete's goal in their words and what it means: the race read from it, predicted times
 * (Daniels VDOT) and the training paces the plan's named paces use. The athlete and the coach can
 * both write it.
 */
export function GoalCard({
  goal,
  today,
  onSave,
  onRemove,
}: {
  goal: GoalDto | null;
  today: LocalDate;
  onSave(input: GoalInput): Promise<unknown>;
  onRemove?: (() => Promise<unknown>) | undefined;
}) {
  const { t, f } = useI18n();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal?.text ?? "");
  const [raceDate, setRaceDate] = useState(goal?.raceDate ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const preview = parseGoal(text);
  const previewPaces = preview ? goalPaces(preview) : null;

  const open = () => {
    setText(goal?.text ?? "");
    setRaceDate(goal?.raceDate ?? "");
    setState("idle");
    setEditing(true);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setState("saving");
    try {
      await onSave({ text: text.trim(), raceDate: raceDate || null });
      setEditing(false);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const races = goal?.paces?.races;
  const weeksLeft =
    goal?.raceDate && goal.raceDate >= today
      ? Math.ceil((Date.parse(goal.raceDate) - Date.parse(today)) / (7 * 86_400_000))
      : null;

  return (
    <section className="card stack goal-card" aria-labelledby={`${id}-title`}>
      <div className="row-between">
        <h2 id={`${id}-title`} className="eyebrow" style={{ margin: 0 }}>
          {t("goal.title")}
        </h2>
        {!editing && (
          <button type="button" className="btn btn-ghost btn-small" onClick={open}>
            <Icon name="edit" size={14} /> {goal ? t("goal.edit") : t("goal.set")}
          </button>
        )}
      </div>

      {editing ? (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-text`}>{t("goal.text")}</label>
            <input
              id={`${id}-text`}
              className="input"
              maxLength={300}
              placeholder={t("goal.placeholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span className="tiny muted">
              {preview && previewPaces
                ? t("goal.reads", {
                    race: t(`goal.race.${preview.race}`),
                    time: f.duration(preview.seconds),
                    m: f.pace(previewPaces.paces.M),
                  })
                : t("goal.hint")}
            </span>
          </div>
          <div className="setting-row">
            <label htmlFor={`${id}-date`}>{t("goal.raceDate")}</label>
            <input
              id={`${id}-date`}
              className="input setting-control wide"
              type="date"
              min={today}
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
            />
          </div>
          {state === "error" && (
            <p className="small" role="alert" style={{ color: "var(--bad)" }}>
              {t("common.error")}
            </p>
          )}
          <div className="row wrap">
            <button
              type="submit"
              className="btn btn-primary btn-small"
              disabled={!text.trim() || state === "saving"}
            >
              {state === "saving" ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setEditing(false)}
            >
              {t("common.cancel")}
            </button>
            {goal && onRemove && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => void onRemove().then(() => setEditing(false))}
              >
                {t("goal.remove")}
              </button>
            )}
          </div>
        </form>
      ) : goal ? (
        <>
          <div className="stack" style={{ gap: 2 }}>
            <strong className="goal-text">{goal.text}</strong>
            <span className="small muted">
              {[
                goal.raceDate ? f.date(goal.raceDate, "long") : null,
                weeksLeft !== null ? t("goal.weeksLeft", { weeks: weeksLeft }) : null,
                goal.setBy ? t("goal.setBy", { name: goal.setBy.name }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {goal.paces ? (
            <>
              <PaceChips paces={goal.paces} />
              <p className="tiny muted num" style={{ margin: 0 }}>
                {t("goal.predicted", { vdot: f.number(goal.paces.vdot, 1) })}{" "}
                {RACE_ORDER.map(
                  (r) => `${t(`goal.race.${r}`)} ${f.duration(races?.[r] ?? 0)}`,
                ).join(" · ")}
              </p>
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              {t("goal.noRace")}
            </p>
          )}
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {t("goal.empty")}
        </p>
      )}
    </section>
  );
}
