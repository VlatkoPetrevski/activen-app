import type { ActivityDto, CalendarDto, PlanEntryDto } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import { useId, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { buildDays, groupOf, type DayEntry } from "../lib/plan.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { activitySummary, paceOrSpeed, plannedSummary } from "./labels.js";
import { useIsMobile } from "../lib/useIsMobile.js";
import { mainSetText, StructureLine } from "./WorkoutSteps.js";
import type { Formatter } from "@activen/i18n";
import type { T } from "../i18n/I18nContext.js";

/** One line of a day: what was planned, and what was done for it. */
interface Pair {
  key: string;
  plan: DayEntry | null;
  activity: ActivityDto | null;
}

function pairsOf(entries: DayEntry[], extras: ActivityDto[]): Pair[] {
  return [
    ...entries.map((d) => ({ key: d.entry.id, plan: d, activity: d.activity })),
    ...extras.map((a) => ({ key: a.id, plan: null, activity: a })),
  ];
}

/** Share of the planned distance (or time) that was done: "103 %". */
function ofPlan(entry: PlanEntryDto, a: ActivityDto): number | null {
  if (entry.plannedDistanceInMeters && a.distanceInMeters)
    return Math.round((a.distanceInMeters / entry.plannedDistanceInMeters) * 100);
  if (entry.plannedDurationInSeconds)
    return Math.round((a.durationInSeconds / entry.plannedDurationInSeconds) * 100);
  return null;
}

/** "14k: 6×1k @5K темпо / 400m", "45′: 3×10′ @Z4 / 2′", or the description when unstructured. */
export function compactPlanText(f: Formatter, t: T, e: PlanEntryDto): string {
  if (e.kind === "rest") return t("plan.kind.rest");
  const total = e.plannedDistanceInMeters
    ? f.unitSystem === "imperial"
      ? `${f.number(e.plannedDistanceInMeters / 1609.344, 1)}mi`
      : `${f.number(e.plannedDistanceInMeters / 1000, 1)}k`
    : e.plannedDurationInSeconds
      ? `${Math.round(e.plannedDurationInSeconds / 60)}′`
      : "";
  const main = e.structure ? mainSetText(f, t, e.structure) : "";
  const body = main || e.description;
  return total && main ? `${total}: ${body}` : body;
}

/** "14,6 km · 5:01 /km · RPE 8 · 104%" — what was done, in one short line. */
function compactDoneText(f: Formatter, a: ActivityDto, plan: PlanEntryDto | null): string {
  const pct = plan ? ofPlan(plan, a) : null;
  return [
    a.distanceInMeters ? f.distance(a.distanceInMeters, 1) : f.duration(a.durationInSeconds),
    a.distanceInMeters ? (paceOrSpeed(f, a)?.text ?? null) : null,
    a.feedback?.perceivedEffort ? `RPE ${a.feedback.perceivedEffort}` : null,
    pct !== null ? `${pct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The week as two columns: the plan on the left, what was done on the right. Plan cells open
 * the editor; done cells open the activity stats.
 */
export function PlanCompare({
  calendar,
  days,
  today,
  onEdit,
  onAdd,
  onOpenActivity,
  addButton,
}: {
  calendar: CalendarDto;
  days: LocalDate[];
  today: LocalDate;
  onEdit(entry: PlanEntryDto): void;
  onAdd(date: LocalDate): void;
  onOpenActivity(activity: ActivityDto): void;
  /** Shown at the right of the column headers. */
  addButton?: ReactNode;
}) {
  const { t, f } = useI18n();
  const rows = buildDays(calendar, days, today);
  // Phones: each day is one short line (plan, and what was done under it) that opens in place.
  const compact = useIsMobile();
  const [open, setOpen] = useState<Set<LocalDate>>(() => new Set([today]));
  const baseId = useId();
  const toggle = (date: LocalDate) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const planCell = (p: Pair, date: LocalDate) => {
    if (!p.plan)
      return p.activity ? (
        <div className="cmp-cell cmp-empty">{t("planner.unplanned")}</div>
      ) : (
        <button
          type="button"
          className="cmp-cell cmp-add"
          onClick={() => onAdd(date)}
          aria-label={`${t("planner.addPlan")} — ${f.date(date, "long")}`}
        >
          <Icon name="plus" size={16} /> {t("planner.addPlan")}
        </button>
      );
    const e = p.plan.entry;
    const rest = e.kind === "rest";
    return (
      <button
        type="button"
        className={`cmp-cell cmp-plan${rest ? " rest" : ""}`}
        onClick={() => onEdit(e)}
      >
        <SportIcon group={rest ? "rest" : groupOf(e.plannedActivityType)} />
        <div className="grow">
          <div className="cmp-title">{e.description}</div>
          {!rest && <div className="small muted num">{plannedSummary(f, e)}</div>}
          {!rest && <StructureLine structure={e.structure} />}
          {e.notes && <div className="small cmp-note">💬 {e.notes}</div>}
        </div>
      </button>
    );
  };

  const doneCell = (p: Pair) => {
    const a = p.activity;
    if (!a) {
      const status = p.plan?.status;
      if (status === "missed")
        return <div className="cmp-cell cmp-missed">{t("planner.missed")}</div>;
      if (status === "planned")
        return <div className="cmp-cell cmp-upcoming">{t("planner.upcoming")}</div>;
      return <div className="cmp-cell cmp-blank" aria-hidden="true" />;
    }
    const pct = p.plan ? ofPlan(p.plan.entry, a) : null;
    const fb = a.feedback;
    return (
      <button
        type="button"
        className={`cmp-cell cmp-done${p.plan ? "" : " extra"}`}
        onClick={() => onOpenActivity(a)}
      >
        <span className="sr-only">{t("planner.openStats", { name: "" })}</span>
        <SportIcon group={groupOf(a.activityType)} />
        <div className="grow">
          <div className="row-between">
            <span className="cmp-title">{a.activityName}</span>
            {pct !== null && (
              <span className={`chip ${pct >= 90 && pct <= 115 ? "good" : "warn"}`}>{pct}%</span>
            )}
          </div>
          <div className="small muted num">{activitySummary(f, a)}</div>
          <div className="tiny muted num">
            {a.averageHeartRateInBeatsPerMinute !== null &&
              `♥ ${a.averageHeartRateInBeatsPerMinute}/${a.maxHeartRateInBeatsPerMinute ?? "—"}`}
            {fb?.perceivedEffort ? ` · RPE ${fb.perceivedEffort}` : ""}
            {fb?.comment ? ` · „${fb.comment}“` : ""}
          </div>
        </div>
        <Icon name="chevronRight" size={16} />
      </button>
    );
  };

  return (
    <div className="cmp">
      <div className="cmp-head">
        <span />
        <span aria-hidden="true">{t("planner.plan")}</span>
        <span className="row-between">
          <span aria-hidden="true">{t("planner.done")}</span>
          {addButton}
        </span>
      </div>
      {rows.map((day) => {
        const pairs = pairsOf(day.entries, day.extras);
        const lines = pairs.length ? pairs : [{ key: "empty", plan: null, activity: null }];
        return (
          <div
            key={day.date}
            className={`cmp-day${day.date === today ? " is-today" : ""}${compact ? " compact" : ""}`}
          >
            {compact ? (
              <button
                type="button"
                className="cmp-summary"
                aria-expanded={open.has(day.date)}
                aria-controls={`${baseId}-${day.date}`}
                onClick={() => toggle(day.date)}
              >
                <span className="plan-date">
                  <span className="dow">{f.date(day.date, "weekdayShort")}</span>
                  <span className="dom num">{Number(day.date.slice(8))}</span>
                </span>
                <span className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                  {pairs.length === 0 && (
                    <span className="small muted">{t("planner.addPlan")}</span>
                  )}
                  {pairs.map((p) => (
                    <span key={p.key} className="stack" style={{ gap: 2, minWidth: 0 }}>
                      {p.plan && (
                        <span
                          className={`cmp-short plan ${p.plan.entry.kind === "rest" ? "rest" : groupOf(p.plan.entry.plannedActivityType)}`}
                        >
                          <span className="cmp-tag">{t("planner.plan")}</span>
                          {compactPlanText(f, t, p.plan.entry)}
                        </span>
                      )}
                      {p.activity ? (
                        <span className="cmp-short done num">
                          <span className="cmp-tag" aria-hidden>
                            ✓
                          </span>
                          <span className="sr-only">{t("planner.done")}: </span>
                          {compactDoneText(f, p.activity, p.plan?.entry ?? null)}
                        </span>
                      ) : p.plan?.status === "missed" ? (
                        <span className="cmp-short missed">{t("planner.missed")}</span>
                      ) : null}
                    </span>
                  ))}
                </span>
                <span className="segment-chevron" aria-hidden>
                  <Icon name="chevronDown" size={18} />
                </span>
              </button>
            ) : (
              <div className="plan-date">
                <div className="dow">{f.date(day.date, "weekdayShort")}</div>
                <div className="dom num">{Number(day.date.slice(8))}</div>
              </div>
            )}
            {(!compact || open.has(day.date)) && (
              <div className="cmp-lines" id={`${baseId}-${day.date}`}>
                {lines.map((p) => (
                  <div key={p.key} className="cmp-line">
                    {planCell(p, day.date)}
                    {doneCell(p)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!calendar.activitiesVisible && <p className="small muted">{t("coachApp.noShared")}</p>}
    </div>
  );
}
