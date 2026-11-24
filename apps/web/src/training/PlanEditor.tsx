import type { PlanEntryDto } from "@activen/contracts";
import {
  workoutTotals,
  type ActivityType,
  type LocalDate,
  type WorkoutStructure,
} from "@activen/domain";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type PlanInput, type PlanPatch } from "../api/api.js";
import { errorMessageKey } from "../ui/States.js";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { useConfirm } from "../ui/Confirm.js";
import { Dialog } from "../ui/Dialog.js";
import { PLAN_SPORTS, sportLabel } from "./labels.js";
import { usePaces } from "./PacesContext.js";
import { WorkoutSummary } from "./WorkoutSummary.js";

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
  const paces = usePaces();
  const [structuring, setStructuring] = useState<"idle" | "busy" | "none" | "error">("idle");
  /** The description the structure was made from: a changed text makes a new one. */
  const [structuredFrom, setStructuredFrom] = useState<string | null>(null);
  /** The coach chose plain text for this description: no structure until it changes. */
  const [plainFor, setPlainFor] = useState<string | null>(null);
  const [manualTotals, setManualTotals] = useState(false);
  const request = useRef(0);
  const auto = useMe().settings.workoutSuggestions;

  // A fresh entry (e.g. reloaded after a conflict) replaces the draft; the message stays.
  useEffect(() => {
    if (open) setDraft(toDraft(entry, date, f.distanceValue));
  }, [open, entry, date, f.distanceValue]);
  useEffect(() => {
    if (open) {
      setError(null);
      setStructuring("idle");
      setPlainFor(null);
      setStructuredFrom(entry?.structure ? entry.description.trim() : null);
      setManualTotals(!!entry && !entry.structure && entry.kind === "workout");
    }
  }, [open, entry]);

  // The structure follows the description (after a short pause): what the coach writes is read
  // into steps, totals and advice below it. Steps the coach edited by hand are kept until they
  // ask for a new reading.
  const text = draft.description.trim();
  const handEdited = draft.structure?.source === "manual";
  const read = async (id: number) => {
    setStructuring("busy");
    try {
      const { structure } = await api.structureWorkout(text, f.locale);
      if (id !== request.current) return;
      setDraft((d) => ({ ...d, structure }));
      setStructuredFrom(text);
      setStructuring(structure ? "idle" : "none");
    } catch {
      if (id === request.current) setStructuring("error");
    }
  };
  useEffect(() => {
    const id = ++request.current;
    if (
      !open ||
      !auto ||
      draft.kind !== "workout" ||
      text === structuredFrom ||
      text === plainFor ||
      handEdited
    )
      return;
    if (text.length < 4) {
      setDraft((d) => (d.structure ? { ...d, structure: null } : d));
      setStructuring("idle");
      return;
    }
    const timer = setTimeout(() => void read(id), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auto, draft.kind, text, structuredFrom, plainFor, handEdited]);

  /** With automatic reading off (Profile → Planning), or after editing steps by hand. */
  const structurize = () => {
    setDraft((d) => ({ ...d, structure: null }));
    setPlainFor(null);
    void read(++request.current);
  };

  const totals = draft.structure ? workoutTotals(draft.structure, paces) : null;
  const stale = !!draft.structure && structuredFrom !== null && structuredFrom !== text;

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
      // From the structure when there is one; typed by hand only for a plain-text workout.
      plannedDistanceInMeters: rest
        ? null
        : totals
          ? totals.meters || null
          : Math.round(f.toMeters(num(draft.distance) ?? 0)) || null,
      plannedDurationInSeconds: rest
        ? null
        : totals
          ? totals.seconds || null
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
        // Server texts are English; the user gets a localized message.
        setError(
          t(err instanceof ApiError && err.status === 422 ? "plan.invalid" : errorMessageKey(err)),
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
                <span className="label" id="plan-sport-label">
                  {t("plan.field.activityType")}
                </span>
                <div className="chips sport-chips" role="group" aria-labelledby="plan-sport-label">
                  {PLAN_SPORTS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      className="chip chip-button"
                      aria-pressed={draft.plannedActivityType === sp}
                      onClick={() => set("plannedActivityType", sp)}
                    >
                      {sportLabel(t, sp)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip chip-button"
                    aria-pressed={draft.plannedActivityType === ""}
                    onClick={() => set("plannedActivityType", "")}
                  >
                    {t("plan.field.anySport")}
                  </button>
                </div>
              </div>
              <div className="field full">
                <label htmlFor="plan-desc">{t("plan.field.description")}</label>
                <textarea
                  id="plan-desc"
                  className="input"
                  required
                  rows={2}
                  maxLength={500}
                  placeholder={t("plan.descPlaceholder")}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div
                className="field full workout-box"
                role="region"
                aria-label={t("workout.summary")}
              >
                <div className="row-between">
                  <span className="label">{t("workout.summary")}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {structuring === "busy" && (
                      <span className="small muted">{t("workout.structurizing")}</span>
                    )}
                    {(!auto || handEdited || stale) && text.length >= 4 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={structuring === "busy"}
                        onClick={structurize}
                      >
                        {t(draft.structure ? "workout.reread" : "workout.structurize")}
                      </button>
                    )}
                    {draft.structure && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          set("structure", null);
                          setPlainFor(text);
                          setStructuredFrom(null);
                        }}
                      >
                        {t("workout.plain")}
                      </button>
                    )}
                  </span>
                </div>
                {draft.structure ? (
                  <>
                    <WorkoutSummary
                      structure={draft.structure}
                      onChange={(next) => set("structure", next)}
                    />
                    {stale && <span className="small warn-text">{t("workout.stale")}</span>}
                    <span className="tiny muted">{t("workout.editHint")}</span>
                  </>
                ) : (
                  <span className="small muted">
                    {structuring === "none"
                      ? t("workout.notRecognized")
                      : structuring === "error"
                        ? t("common.error")
                        : text === plainFor && text
                          ? t("workout.plainSet")
                          : t(auto ? "workout.hint" : "workout.hintManual")}
                  </span>
                )}
              </div>
              {!draft.structure && (
                <div className="field full">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    aria-expanded={manualTotals}
                    aria-controls="plan-totals"
                    onClick={() => setManualTotals((x) => !x)}
                  >
                    {t("plan.manualTotals")}
                  </button>
                </div>
              )}
              {!draft.structure && manualTotals && (
                <div id="plan-totals" className="form-grid full" style={{ gridColumn: "1 / -1" }}>
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
                </div>
              )}
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
