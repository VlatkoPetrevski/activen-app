import type { PlanEntryDto } from "@activen/contracts";
import type { ActivityType, LocalDate } from "@activen/domain";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type PlanInput, type PlanPatch } from "../api/api.js";
import { useI18n } from "../i18n/I18nContext.js";
import { useConfirm } from "../ui/Confirm.js";
import { Dialog } from "../ui/Dialog.js";
import { PLAN_SPORTS, sportLabel } from "./labels.js";

interface Draft {
  calendarDate: LocalDate;
  kind: "workout" | "rest";
  description: string;
  plannedActivityType: ActivityType | "";
  distanceKm: string;
  durationMin: string;
  notes: string;
}

const toDraft = (e: PlanEntryDto | null, date: LocalDate): Draft => ({
  calendarDate: e?.calendarDate ?? date,
  kind: e?.kind ?? "workout",
  description: e?.description ?? "",
  plannedActivityType: e ? (e.plannedActivityType ?? "") : "RUNNING",
  distanceKm: e?.plannedDistanceInMeters ? String(e.plannedDistanceInMeters / 1000) : "",
  durationMin: e?.plannedDurationInSeconds
    ? String(Math.round(e.plannedDurationInSeconds / 60))
    : "",
  notes: e?.notes ?? "",
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
  const { t } = useI18n();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry, date));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh entry (e.g. reloaded after a conflict) replaces the draft; the message stays.
  useEffect(() => {
    if (open) setDraft(toDraft(entry, date));
  }, [open, entry, date]);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

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
      plannedDistanceInMeters: rest ? null : (num(draft.distanceKm) ?? 0) * 1000 || null,
      plannedDurationInSeconds: rest
        ? null
        : Math.round((num(draft.durationMin) ?? 0) * 60) || null,
      ...(canEditNotes ? { notes: draft.notes.trim() || null } : {}),
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
                <input
                  id="plan-desc"
                  className="input"
                  required
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                />
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
                <label htmlFor="plan-km">{t("plan.field.distance")}</label>
                <input
                  id="plan-km"
                  className="input num"
                  inputMode="decimal"
                  value={draft.distanceKm}
                  onChange={(e) => set("distanceKm", e.target.value)}
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
