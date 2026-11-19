import type { FeedbackDto } from "@activen/contracts";
import { useState, type FormEvent } from "react";
import type { FeedbackInput } from "../api/api.js";
import { useI18n } from "../i18n/I18nContext.js";

const FEEL_EMOJI = ["😫", "😕", "🙂", "😊", "🤩"] as const;

/** RPE level label groups: 1–2, 3–4, 5–6, 7–8, 9, 10. */
const effortLevel = (v: number) =>
  v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : v <= 8 ? 4 : v === 9 ? 5 : 6;

/** Post-session check-in: effort (RPE 1–10), feel (1–5) and a comment for the coach. */
export function CheckInForm({
  initial,
  onSave,
}: {
  initial: FeedbackDto | null;
  onSave(input: FeedbackInput): Promise<unknown>;
}) {
  const { t } = useI18n();
  const [effort, setEffort] = useState<number | null>(initial?.perceivedEffort ?? null);
  const [feel, setFeel] = useState<number | null>(initial?.feel ?? null);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
    <form className="stack-l" onSubmit={submit}>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="row-between" style={{ width: "100%" }}>
          <h3>{t("checkin.effort")}</h3>
          <span className="small muted">
            {effort
              ? `${effort} · ${t(`checkin.effortLevel.${effortLevel(effort)}` as "checkin.effortLevel.1")}`
              : t("checkin.effortHint")}
          </span>
        </legend>
        <div className="rpe" role="group" aria-label={t("checkin.effort")}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" aria-pressed={effort === v} onClick={() => setEffort(v)}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>
          <h3>{t("checkin.feel")}</h3>
        </legend>
        <div className="feel" role="group" aria-label={t("checkin.feel")}>
          {FEEL_EMOJI.map((emoji, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={feel === i + 1}
              onClick={() => setFeel(i + 1)}
            >
              <span aria-hidden>{emoji}</span>
              <span>{t(`checkin.feel.${i + 1}` as "checkin.feel.1")}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="checkin-comment">{t("checkin.comment")}</label>
        <textarea
          id="checkin-comment"
          className="input"
          maxLength={2000}
          placeholder={t("checkin.commentPlaceholder")}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
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
        {state === "saving" ? t("common.saving") : t("checkin.submit")}
      </button>
    </form>
  );
}
