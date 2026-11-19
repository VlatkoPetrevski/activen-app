import type { PlanEntryDto } from "@activen/contracts";
import { addDays, type LocalDate } from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n/I18nContext.js";
import { weekOf } from "../lib/dates.js";
import { buildDays, groupOf, type DayEntry } from "../lib/plan.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { QueryView } from "../ui/States.js";
import { activitySummary, plannedSummary } from "./labels.js";
import { PlanEditor } from "./PlanEditor.js";
import type { PlanTarget } from "./target.js";

/** Week of plan entries with their linked activities; entries open the editor. */
export function PlanWeek({
  target,
  today,
  activityLink,
}: {
  target: PlanTarget;
  today: LocalDate;
  /** Where a completed activity links to (athletes: detail page; coaches: none). */
  activityLink?: (activityId: string) => string;
}) {
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(today);
  const week = weekOf(anchor);
  const key = [...target.key, "calendar", week.from, week.to];
  const query = useQuery({ queryKey: key, queryFn: () => target.calendar(week.from, week.to) });
  const [editing, setEditing] = useState<{ entry: PlanEntryDto | null; date: LocalDate } | null>(
    null,
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: target.key });
  const run = async <R,>(p: Promise<R>) => {
    const r = await p;
    await invalidate();
    return r;
  };

  const statusChip = (d: DayEntry) =>
    d.status === "done" ? (
      <span className="chip good">{t("plan.status.done")}</span>
    ) : d.status === "missed" ? (
      <span className="chip bad">{t("plan.status.missed")}</span>
    ) : d.status === "planned" ? (
      <span className="chip warn">{t("plan.status.planned")}</span>
    ) : null;

  return (
    <div className="stack">
      <div className="row-between">
        <button
          type="button"
          className="icon-btn"
          aria-label={t("common.previousWeek")}
          onClick={() => setAnchor(addDays(week.from, -7))}
        >
          <Icon name="chevronLeft" />
        </button>
        <div className="stack" style={{ gap: 0, alignItems: "center" }}>
          <h2>{t("common.weekOf", { date: f.date(week.from, "dayMonth") })}</h2>
          {week.from !== weekOf(today).from && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setAnchor(today)}
            >
              {t("common.today")}
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("common.nextWeek")}
          onClick={() => setAnchor(addDays(week.from, 7))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>

      <QueryView query={query}>
        {(calendar) => {
          const days = buildDays(calendar, week.days, today);
          const workouts = days.flatMap((d) => d.entries).filter((e) => e.status !== "rest");
          return (
            <div className="card">
              <div className="row-between small muted" style={{ marginBottom: 4 }}>
                <span>
                  {t("plan.weekTotal", {
                    planned: workouts.length,
                    done: workouts.filter((e) => e.status === "done").length,
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setEditing({ entry: null, date: anchor < today ? today : anchor })}
                >
                  <Icon name="plus" size={18} /> {t("plan.add")}
                </button>
              </div>
              {days.map((day) => (
                <div key={day.date} className={`plan-day${day.date === today ? " is-today" : ""}`}>
                  <div className="plan-date">
                    <div className="dow">{f.date(day.date, "weekdayShort")}</div>
                    <div className="dom num">{Number(day.date.slice(8))}</div>
                  </div>
                  <div>
                    {day.entries.map((d) => (
                      <button
                        key={d.entry.id}
                        type="button"
                        className={`plan-entry ${d.status}`}
                        onClick={() => setEditing({ entry: d.entry, date: day.date })}
                      >
                        <SportIcon
                          group={
                            d.entry.kind === "rest" ? "rest" : groupOf(d.entry.plannedActivityType)
                          }
                        />
                        <div className="grow">
                          <div className="row-between">
                            <h3>{d.entry.description}</h3>
                            {statusChip(d)}
                          </div>
                          <div className="small muted">
                            {d.activity
                              ? activitySummary(f, d.activity)
                              : plannedSummary(f, d.entry)}
                          </div>
                          {d.entry.notes && (
                            <div className="small" style={{ marginTop: 4 }}>
                              💬 {d.entry.notes}
                            </div>
                          )}
                          {d.activity?.feedback?.perceivedEffort && (
                            <div className="tiny muted" style={{ marginTop: 2 }}>
                              RPE {d.activity.feedback.perceivedEffort}
                              {d.activity.feedback.comment
                                ? ` · „${d.activity.feedback.comment}“`
                                : ""}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                    {day.extras.map((a) => {
                      const body = (
                        <>
                          <SportIcon group={groupOf(a.activityType)} />
                          <div className="grow">
                            <div className="row-between">
                              <h3>{a.activityName ?? ""}</h3>
                              <span className="chip teal">{t("plan.status.unplanned")}</span>
                            </div>
                            <div className="small muted">{activitySummary(f, a)}</div>
                          </div>
                        </>
                      );
                      return activityLink ? (
                        <Link
                          key={a.id}
                          className="plan-entry extra"
                          to={activityLink(a.id)}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div key={a.id} className="plan-entry extra">
                          {body}
                        </div>
                      );
                    })}
                    {day.entries.length === 0 && day.extras.length === 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setEditing({ entry: null, date: day.date })}
                        aria-label={`${t("plan.add")} — ${f.date(day.date, "long")}`}
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!calendar.activitiesVisible && (
                <p className="small muted">{t("coachApp.noShared")}</p>
              )}
            </div>
          );
        }}
      </QueryView>

      <PlanEditor
        open={editing !== null}
        entry={editing?.entry ?? null}
        date={editing?.date ?? today}
        canEditNotes={target.canEditNotes}
        onClose={() => setEditing(null)}
        onCreate={(input) => run(target.create(input))}
        onUpdate={(id, patch) => run(target.update(id, patch))}
        onDelete={(id) => run(target.remove(id))}
        onConflict={async () => {
          const fresh = (await query.refetch()).data?.entries.find(
            (e) => e.id === editing?.entry?.id,
          );
          if (fresh) setEditing({ entry: fresh, date: fresh.calendarDate });
        }}
      />
    </div>
  );
}
