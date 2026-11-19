import type { FeedbackDto } from "@activen/contracts";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { FeedbackInput } from "../api/api.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";

const FEEL_EMOJI = ["😫", "😕", "🙂", "😊", "🤩"] as const;

/** RPE level label groups: 1–2, 3–4, 5–6, 7–8, 9, 10. */
const effortLevel = (v: number) =>
  v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : v <= 8 ? 4 : v === 9 ? 5 : 6;

/**
 * Post-session check-in. Effort (RPE 1–10) and feel (1–5) are one row each and can be tapped right
 * away; tapping one (or the header) opens the rest — the hint, a comment for the coach and send.
 * The header toggles it closed again.
 */
export function CheckInForm({
  initial,
  onSave,
  title,
  subtitle,
  coachName,
  defaultOpen = false,
}: {
  initial: FeedbackDto | null;
  onSave(input: FeedbackInput): Promise<unknown>;
  title: string;
  subtitle?: ReactNode;
  /** Active coach: the button says who will receive it. */
  coachName?: string | null;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [effort, setEffort] = useState<number | null>(initial?.perceivedEffort ?? null);
  const [feel, setFeel] = useState<number | null>(initial?.feel ?? null);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const pickEffort = (v: number) => {
    setEffort(v);
    setOpen(true);
    setState("idle");
  };
  const pickFeel = (v: number) => {
    setFeel(v);
    setOpen(true);
    setState("idle");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    try {
      await onSave({ perceivedEffort: effort, feel, comment: comment.trim() || null });
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <form className={`segment checkin${open ? " open" : ""}`} onSubmit={submit}>
      <button
        type="button"
        className="segment-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="segment-summary">
          <span className="row-between">
            <h2>{title}</h2>
            {state === "saved" && <span className="chip good">{t("checkin.done")}</span>}
          </span>
          {subtitle && <span className="small muted">{subtitle}</span>}
        </span>
        <span className="segment-chevron" aria-hidden>
          <Icon name="chevronDown" size={20} />
        </span>
      </button>

      <div className="checkin-quick">
        <div className="checkin-label">
          <span>{t("checkin.effort")}</span>
          <span className="muted">
            {effort
              ? `${effort} · ${t(`checkin.effortLevel.${effortLevel(effort)}` as "checkin.effortLevel.1")}`
              : t("checkin.effortHint")}
          </span>
        </div>
        <div className="rpe compact" role="group" aria-label={t("checkin.effort")}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" aria-pressed={effort === v} onClick={() => pickEffort(v)}>
              {v}
            </button>
          ))}
        </div>
        <div className="checkin-label">
          <span>{t("checkin.feel")}</span>
        </div>
        <div className="feel compact" role="group" aria-label={t("checkin.feel")}>
          {FEEL_EMOJI.map((emoji, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={feel === i + 1}
              onClick={() => pickFeel(i + 1)}
            >
              <span aria-hidden>{emoji}</span>
              <span>{t(`checkin.feel.${i + 1}` as "checkin.feel.1")}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="segment-body" id={id} inert={!open}>
        <div className="segment-inner">
          <div className="checkin-more stack">
            <div className="field">
              <label htmlFor={`${id}-comment`}>{t("checkin.comment")}</label>
              <textarea
                id={`${id}-comment`}
                className="input checkin-comment"
                rows={5}
                maxLength={2000}
                placeholder={t("checkin.commentPlaceholder")}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setState("idle");
                }}
              />
            </div>
            {state === "saved" && (
              <div className="alert success" role="status">
                {t("checkin.saved")}
              </div>
            )}
            {state === "error" && (
              <div className="alert error" role="alert">
                {t("common.error")}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={state === "saving" || (!effort && !feel)}
            >
              {state === "saving"
                ? t("common.saving")
                : coachName
                  ? t("checkin.sendTo", { name: coachName.split(" ")[0] ?? coachName })
                  : t("checkin.submit")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
