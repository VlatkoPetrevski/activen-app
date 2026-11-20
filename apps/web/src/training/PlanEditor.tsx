import type { PlanEntryDto } from "@activen/contracts";
import type { ActivityType, LocalDate, WorkoutStructure } from "@activen/domain";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type PlanInput, type PlanPatch } from "../api/api.js";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { useConfirm } from "../ui/Confirm.js";
import { Dialog } from "../ui/Dialog.js";
import { PLAN_SPORTS, sportLabel } from "./labels.js";
import { WorkoutStepsView } from "./WorkoutSteps.js";

interface Draft {
  calendarDate: LocalDate;
  kind: "workout" | "rest";
  description: string;
  plannedActivityType: ActivityType | "";
  /** In the user's distance unit (km or mi). */
  distance: string;
  durationMin: string;
  notes: string;
  /** Accepted steps; the description stays the source of truth. */
  structure: WorkoutStructure | null;
}

const toDraft = (
  e: PlanEntryDto | null,
  date: LocalDate,
  toUnit: (meters: number) => number,
): Draft => ({
  calendarDate: e?.calendarDate ?? date,
  kind: e?.kind ?? "workout",
  description: e?.description ?? "",
  plannedActivityType: e ? (e.plannedActivityType ?? "") : "RUNNING",
  distance: e?.plannedDistanceInMeters
    ? String(Math.round(toUnit(e.plannedDistanceInMeters) * 100) / 100)
    : "",
  durationMin: e?.plannedDurationInSeconds
    ? String(Math.round(e.plannedDurationInSeconds / 60))
    : "",
  notes: e?.notes ?? "",
  structure: e?.structure ?? null,
});

const num = (s: string): number | null => {
  const v = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(v) && v >= 0 ? v : null;
};

/** Add or edit a plan entry. Handles the 409 "changed meanwhile" case by reloading. */
export function PlanEditor({
  open,
  entry,
  date,
  canEditNotes,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onConflict,
}: {
  open: boolean;
  entry: PlanEntryDto | null;
  date: LocalDate;
  canEditNotes: boolean;
  onClose(): void;
  onCreate(input: PlanInput): Promise<unknown>;
  onUpdate(id: string, patch: PlanPatch): Promise<unknown>;
  onDelete(id: string): Promise<unknown>;
  onConflict(): void;
}) {
  const { t, f } = useI18n();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry, date, f.distanceValue));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();
  const [suggestion, setSuggestion] = useState<WorkoutStructure | null>(null);
  const [structuring, setStructuring] = useState<"idle" | "busy" | "none" | "error">("idle");
  /** The description the accepted structure was made from (to flag later edits). */
  const [structuredFrom, setStructuredFrom] = useState<string | null>(null);

  // A fresh entry (e.g. reloaded after a conflict) replaces the draft; the message stays.
  useEffect(() => {
    if (open) setDraft(toDraft(entry, date, f.distanceValue));
  }, [open, entry, date, f.distanceValue]);
  useEffect(() => {
    if (open) {
      setError(null);
      setSuggestion(null);
      setStructuring("idle");
      setStructuredFrom(entry?.structure ? entry.description : null);
    }
  }, [open, entry]);

  const structurize = async () => {
    setStructuring("busy");
    setSuggestion(null);
    try {
      const { structure } = await api.structureWorkout(draft.description, f.locale);
      setSuggestion(structure);
      setStructuring(structure ? "idle" : "none");
    } catch {
      setStructuring("error");
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const rest = draft.kind === "rest";
    const fields = {
      calendarDate: draft.calendarDate,
      kind: draft.kind,
      description: draft.description.trim() || (rest ? t("plan.kind.rest") : ""),
      plannedActivityType: rest || !draft.plannedActivityType ? null : draft.plannedActivityType,
      plannedDistanceInMeters: rest
        ? null
        : Math.round(f.toMeters(num(draft.distance) ?? 0)) || null,
      plannedDurationInSeconds: rest
        ? null
        : Math.round((num(draft.durationMin) ?? 0) * 60) || null,
      ...(canEditNotes ? { notes: draft.notes.trim() || null } : {}),
      structure: rest ? null : draft.structure,
    };
    try {
      if (entry) await onUpdate(entry.id, { ...fields, expectedVersion: entry.version });
      else await onCreate(fields);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("plan.conflict"));
        onConflict();
      } else
        setError(
          err instanceof ApiError && err.status < 500 && err.status > 0
            ? err.message
            : t("common.error"),
        );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry || !(await confirm(t("plan.deleteConfirm")))) return;
    setBusy(true);
    try {
      await onDelete(entry.id);
      onClose();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={entry ? t("plan.edit") : t("plan.add")} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="plan-date">{t("plan.field.date")}</label>
            <input
              id="plan-date"
              className="input"
              type="date"
              required
              value={draft.calendarDate}
              onChange={(e) => set("calendarDate", e.target.value)}
            />
          </div>
          <div className="field">
            <span className="label">{t("plan.field.kind")}</span>
            <div className="segmented" role="group">
              {(["workout", "rest"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => set("kind", k)}
                >
                  {t(`plan.kind.${k}`)}
                </button>
              ))}
            </div>
          </div>
          {draft.kind === "workout" && (
            <>
              <div className="field full">
                <label htmlFor="plan-desc">{t("plan.field.description")}</label>
                <textarea
                  id="plan-desc"
                  className="input"
                  required
                  rows={2}
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div className="field full workout-box">
                <div className="row-between">
                  <span className="label">{t("workout.structure")}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {draft.structure && !suggestion && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          set("structure", null);
                          setStructuredFrom(null);
                        }}
                      >
                        {t("workout.remove")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={!draft.description.trim() || structuring === "busy"}
                      onClick={() => void structurize()}
                    >
                      {structuring === "busy"
                        ? t("workout.structurizing")
                        : t("workout.structurize")}
                    </button>
                  </span>
                </div>
                {suggestion ? (
                  <div
                    className="workout-suggestion stack-s"
                    role="region"
                    aria-label={t("workout.suggestion")}
                  >
                    <span className={`small ${suggestion.source === "ai" ? "warn-text" : "muted"}`}>
                      {t(`workout.source.${suggestion.source}`)}
                    </span>
                    <WorkoutStepsView structure={suggestion} onChange={setSuggestion} />
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => {
                          set("structure", suggestion);
                          setStructuredFrom(draft.description);
                          setSuggestion(null);
                        }}
                      >
                        {t("workout.accept")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setSuggestion(null)}
                      >
                        {t("workout.discard")}
                      </button>
                    </div>
                  </div>
                ) : draft.structure ? (
                  <>
                    <WorkoutStepsView structure={draft.structure} />
                    {structuredFrom !== null && structuredFrom !== draft.description && (
                      <span className="small warn-text">{t("workout.stale")}</span>
                    )}
                  </>
                ) : (
                  <span className="small muted">
                    {structuring === "none"
                      ? t("workout.notRecognized")
                      : structuring === "error"
                        ? t("common.error")
                        : t("workout.hint")}
                  </span>
                )}
              </div>
              <div className="field full">
                <label htmlFor="plan-sport">{t("plan.field.activityType")}</label>
                <select
                  id="plan-sport"
                  className="input"
                  value={draft.plannedActivityType}
                  onChange={(e) => set("plannedActivityType", e.target.value as ActivityType | "")}
                >
                  <option value="">{t("plan.field.anySport")}</option>
                  {PLAN_SPORTS.map((s) => (
                    <option key={s} value={s}>
                      {sportLabel(t, s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="plan-km">
                  {t("plan.field.distance", { unit: f.distanceUnit })}
                </label>
                <input
                  id="plan-km"
                  className="input num"
                  inputMode="decimal"
                  value={draft.distance}
                  onChange={(e) => set("distance", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="plan-min">{t("plan.field.duration")}</label>
                <input
                  id="plan-min"
                  className="input num"
                  inputMode="numeric"
                  value={draft.durationMin}
                  onChange={(e) => set("durationMin", e.target.value)}
                />
              </div>
              {canEditNotes && (
                <div className="field full">
                  <label htmlFor="plan-notes">{t("plan.field.notes")}</label>
                  <textarea
                    id="plan-notes"
                    className="input"
                    maxLength={2000}
                    value={draft.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="sheet-actions">
          {entry && (
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              {t("common.delete")}
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
