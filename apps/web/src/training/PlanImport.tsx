import type { PlanEntryDto } from "@activen/contracts";
import {
  addDays,
  parsePlanText,
  parseWorkout,
  weekStart,
  workoutTotals,
  type ActivityType,
  type LocalDate,
  type PlanTextDay,
} from "@activen/domain";
import { useId, useState, type ChangeEvent } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Dialog } from "../ui/Dialog.js";
import { Icon } from "../ui/Icon.js";
import { Tabs } from "../ui/Tabs.js";
import { PLAN_SPORTS, sportLabel } from "./labels.js";
import { usePaces } from "./PacesContext.js";
import type { PlanTarget } from "./target.js";
import { mainSetText } from "./WorkoutSteps.js";

/** "23.11": short enough for a phone column. */
const shortDate = (d: LocalDate) => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}`;

/** What to do with a day that already has a session. */
type Action = "replace" | "add" | "skip";

interface Row extends PlanTextDay {
  key: string;
  existing: PlanEntryDto[];
  action: Action;
}

/** Files read here as text; Word/PDF/images need AI reading (with the API key, later). */
const TEXT_FILES = ".txt,.csv,.md,.tsv,text/plain,text/csv";

/**
 * A whole plan at once: pasted text or a text/CSV file, or a week typed day by day. Read into
 * days (no AI: the plan-text and workout parsers), shown for review with what already is on
 * those days, and saved only when the coach (or athlete) confirms.
 */
export function PlanImport({
  open,
  target,
  start,
  onClose,
  onDone,
}: {
  open: boolean;
  target: PlanTarget;
  /** A day of the first week (the week on screen). */
  start: LocalDate;
  onClose(): void;
  onDone(): unknown;
}) {
  const { t, f } = useI18n();
  const paces = usePaces();
  const id = useId();
  const [text, setText] = useState("");
  const [from, setFrom] = useState(weekStart(start));
  const [weeks, setWeeks] = useState<string[][]>([Array<string>(7).fill("")]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "reading" | "saving" | "error">("idle");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  const reset = () => {
    setRows(null);
    setSkipped([]);
    setState("idle");
    setSaved(0);
  };
  const close = () => {
    reset();
    onClose();
  };

  /** Days → rows for review, with the sessions already on those days. */
  const review = async (days: PlanTextDay[], notRead: string[]) => {
    if (days.length === 0) {
      setRows([]);
      setSkipped(notRead);
      return;
    }
    setState("reading");
    try {
      const dates = days.map((d) => d.date).sort();
      const calendar = await target.calendar(dates[0] ?? from, dates.at(-1) ?? from);
      setRows(
        days.map((d, i) => {
          const existing = calendar.entries.filter((e) => e.calendarDate === d.date);
          return { ...d, key: `${d.date}-${i}`, existing, action: "replace" };
        }),
      );
      setSkipped(notRead);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const readText = () => {
    const r = parsePlanText(text, from);
    void review(r.days, r.skipped);
  };
  const readWeeks = () => {
    const days: PlanTextDay[] = [];
    weeks.forEach((week, w) =>
      week.forEach((d, i) => {
        const description = d.trim();
        if (!description) return;
        // Each cell is read like one line of a pasted plan ("одмор" is a rest day).
        const one = parsePlanText(`Ден 1: ${description}`, addDays(from, w * 7 + i)).days[0];
        if (one) days.push(one);
      }),
    );
    void review(days, []);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(txt|csv|md|tsv)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setFileNote(t("planImport.fileNeedsAi", { name: file.name }));
      return;
    }
    setFileNote(null);
    // CSV cells become spaces, so "24.11;10 km лесно" reads like a line.
    setText((await file.text()).replace(/[;\t]/g, " "));
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const save = async () => {
    if (!rows) return;
    setState("saving");
    setSaved(0);
    try {
      const cleared = new Set<LocalDate>();
      const nextSequence = new Map<LocalDate, number>();
      for (const r of rows) {
        if (r.existing.length > 0 && r.action === "skip") continue;
        if (r.existing.length > 0 && r.action === "replace" && !cleared.has(r.date)) {
          for (const e of r.existing) await target.remove(e.id);
          cleared.add(r.date);
        }
        const base = r.existing.length > 0 && r.action === "add" ? r.existing.length : 0;
        const sequence = Math.min(9, nextSequence.get(r.date) ?? base);
        nextSequence.set(r.date, sequence + 1);
        const structure = r.kind === "workout" ? parseWorkout(r.description) : null;
        const totals = structure ? workoutTotals(structure, paces) : null;
        await target.create({
          calendarDate: r.date,
          kind: r.kind,
          description: r.kind === "rest" ? t("plan.kind.rest") : r.description,
          plannedActivityType: r.kind === "rest" ? null : r.activityType,
          plannedDistanceInMeters: totals?.meters || null,
          plannedDurationInSeconds: totals?.seconds || null,
          sequence,
          structure,
        });
        setSaved((n) => n + 1);
      }
      await onDone();
      close();
    } catch {
      setState("error");
    }
  };

  const conflicts = rows?.filter((r) => r.existing.length > 0).length ?? 0;
  const toSave = rows?.filter((r) => !(r.existing.length > 0 && r.action === "skip")).length ?? 0;

  const startField = (
    <div className="setting-row">
      <label htmlFor={`${id}-from`}>{t("planImport.from")}</label>
      <input
        id={`${id}-from`}
        className="input setting-control wide"
        type="date"
        value={from}
        onChange={(e) => setFrom(weekStart(e.target.value || from))}
      />
    </div>
  );

  return (
    <Dialog open={open} wide title={t("planImport.title")} onClose={close}>
      {rows === null ? (
        <Tabs
          label={t("planImport.how")}
          tabs={[
            {
              key: "text",
              title: t("planImport.text"),
              content: (
                <div className="stack">
                  {startField}
                  <div className="field">
                    <label htmlFor={`${id}-text`}>{t("planImport.paste")}</label>
                    <textarea
                      id={`${id}-text`}
                      className="input"
                      rows={9}
                      placeholder={t("planImport.example")}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <span className="tiny muted">{t("planImport.textHint")}</span>
                  </div>
                  <div className="row wrap">
                    <label className="btn btn-secondary btn-small">
                      <Icon name="upload" size={16} /> {t("planImport.file")}
                      <input
                        type="file"
                        accept={`${TEXT_FILES},.pdf,.docx,.xlsx,image/*`}
                        className="sr-only"
                        onChange={(e) => void onFile(e)}
                      />
                    </label>
                    <span className="grow" />
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={!text.trim() || state === "reading"}
                      onClick={readText}
                    >
                      {t("planImport.read")}
                    </button>
                  </div>
                  {fileNote && (
                    <p className="small" role="status">
                      {fileNote}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: "week",
              title: t("planImport.week"),
              content: (
                <div className="stack">
                  {startField}
                  {weeks.map((week, w) => (
                    <fieldset key={w} className="plan-week-table">
                      <legend className="small muted">
                        {t("planImport.weekN", {
                          n: w + 1,
                          from: f.date(addDays(from, w * 7), "dayMonth"),
                        })}
                      </legend>
                      {week.map((value, i) => {
                        const date = addDays(from, w * 7 + i);
                        return (
                          <div key={i} className="plan-week-row">
                            <input
                              className="input"
                              aria-label={f.date(date, "long")}
                              placeholder={i === 0 ? t("planImport.cellExample") : ""}
                              value={value}
                              onChange={(e) =>
                                setWeeks((ws) =>
                                  ws.map((wk, j) =>
                                    j === w ? wk.map((c, k) => (k === i ? e.target.value : c)) : wk,
                                  ),
                                )
                              }
                            />
                            <span className="plan-week-date small" aria-hidden>
                              <strong>{f.date(date, "weekdayShort")}</strong> {shortDate(date)}
                            </span>
                          </div>
                        );
                      })}
                    </fieldset>
                  ))}
                  <div className="row wrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setWeeks((ws) => [...ws, Array<string>(7).fill("")])}
                    >
                      <Icon name="plus" size={16} /> {t("planImport.addWeek")}
                    </button>
                    <span className="grow" />
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={
                        weeks.every((w) => w.every((c) => !c.trim())) || state === "reading"
                      }
                      onClick={readWeeks}
                    >
                      {t("planImport.read")}
                    </button>
                  </div>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <div className="stack">
          <p className="small" role="status">
            {rows.length === 0
              ? t("planImport.none")
              : t("planImport.found", { days: rows.length, conflicts })}
          </p>
          {skipped.length > 0 && (
            <p className="small muted">
              {t("planImport.skipped")} {skipped.map((s) => `„${s}“`).join(", ")}
            </p>
          )}
          <ul className="import-rows">
            {rows.map((r) => {
              const structure = r.kind === "workout" ? parseWorkout(r.description) : null;
              const main = structure ? mainSetText(f, t, structure, paces) : "";
              return (
                <li key={r.key} className={`import-row${r.existing.length ? " conflict" : ""}`}>
                  <span className="import-date">
                    <span className="dow">{f.date(r.date, "weekdayShort")}</span>
                    <span className="num">{shortDate(r.date)}</span>
                  </span>
                  <span className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                    {r.kind === "rest" ? (
                      <span className="cmp-short plan rest">{t("plan.kind.rest")}</span>
                    ) : (
                      <>
                        <span className="row" style={{ gap: 6 }}>
                          <select
                            className="input input-small"
                            aria-label={t("planImport.sportFor", { date: f.date(r.date, "long") })}
                            value={r.activityType ?? ""}
                            onChange={(e) =>
                              update(r.key, { activityType: e.target.value as ActivityType })
                            }
                          >
                            {PLAN_SPORTS.map((s) => (
                              <option key={s} value={s}>
                                {sportLabel(t, s)}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input grow"
                            aria-label={t("planImport.descFor", { date: f.date(r.date, "long") })}
                            value={r.description}
                            maxLength={500}
                            onChange={(e) => update(r.key, { description: e.target.value })}
                          />
                        </span>
                        {main && <span className="small muted">{main}</span>}
                      </>
                    )}
                    {r.existing.length > 0 && (
                      <span className="row wrap small" style={{ gap: 6 }}>
                        <span className="warn-text">
                          {t("planImport.already", {
                            what: r.existing.map((e) => e.description).join(" · "),
                          })}
                        </span>
                        <select
                          className="input input-small"
                          aria-label={t("planImport.actionFor", { date: f.date(r.date, "long") })}
                          value={r.action}
                          onChange={(e) => update(r.key, { action: e.target.value as Action })}
                        >
                          <option value="replace">{t("planImport.replace")}</option>
                          <option value="add">{t("planImport.add")}</option>
                          <option value="skip">{t("planImport.skip")}</option>
                        </select>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {state === "error" && (
            <p className="small" role="alert" style={{ color: "var(--bad)" }}>
              {t("planImport.error", { saved })}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {t("planImport.back")}
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn btn-primary"
              disabled={toSave === 0 || state === "saving"}
              onClick={() => void save()}
            >
              {state === "saving"
                ? t("planImport.saving", { saved, total: toSave })
                : t("planImport.save", { count: toSave })}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
