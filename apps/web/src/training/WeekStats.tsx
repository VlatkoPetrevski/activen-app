import type { CalendarDto } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import { useI18n } from "../i18n/I18nContext.js";
import { groupOf } from "../lib/plan.js";
import { SportIcon } from "../ui/Icon.js";

export interface WeekTotals {
  sessions: { done: number; planned: number };
  distance: { done: number; planned: number };
  time: { done: number; planned: number };
  elevation: number;
  load: number;
  /** Time-weighted over activities with heart rate. */
  averageHeartRate: number | null;
  byGroup: { group: string; distance: number; time: number; count: number }[];
}

/** Plan vs. done for one week of a calendar (the week's range only). */
export function weekTotals(calendar: CalendarDto, from: LocalDate, to: LocalDate): WeekTotals {
  const entries = calendar.entries.filter(
    (e) => e.kind === "workout" && e.calendarDate >= from && e.calendarDate <= to,
  );
  const acts = calendar.activities.filter((a) => a.calendarDate >= from && a.calendarDate <= to);
  const done = new Set(calendar.links.filter((l) => l.activityId).map((l) => l.planEntryId));
  const withHr = acts.filter((a) => a.averageHeartRateInBeatsPerMinute !== null);
  const hrTime = withHr.reduce((s, a) => s + a.durationInSeconds, 0);
  const groups = new Map<
    string,
    { group: string; distance: number; time: number; count: number }
  >();
  for (const a of acts) {
    const group = groupOf(a.activityType);
    const g = groups.get(group) ?? { group, distance: 0, time: 0, count: 0 };
    g.distance += a.distanceInMeters ?? 0;
    g.time += a.durationInSeconds;
    g.count += 1;
    groups.set(group, g);
  }
  return {
    sessions: {
      done: entries.filter((e) => done.has(e.id)).length,
      planned: entries.length,
    },
    distance: {
      done: acts.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0),
      planned: entries.reduce((s, e) => s + (e.plannedDistanceInMeters ?? 0), 0),
    },
    time: {
      done: acts.reduce((s, a) => s + a.durationInSeconds, 0),
      planned: entries.reduce((s, e) => s + (e.plannedDurationInSeconds ?? 0), 0),
    },
    elevation: acts.reduce((s, a) => s + (a.totalElevationGainInMeters ?? 0), 0),
    load: acts.reduce((s, a) => s + (a.trainingLoad ?? 0), 0),
    averageHeartRate: hrTime
      ? Math.round(
          withHr.reduce(
            (s, a) => s + (a.averageHeartRateInBeatsPerMinute ?? 0) * a.durationInSeconds,
            0,
          ) / hrTime,
        )
      : null,
    byGroup: [...groups.values()].sort((a, b) => b.time - a.time),
  };
}

function Meter({ done, planned }: { done: number; planned: number }) {
  if (!planned) return null;
  const pct = Math.min(100, Math.round((done / planned) * 100));
  return (
    <div className="progress-track" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Totals of the selected week under the month calendar. */
export function WeekStats({
  calendar,
  from,
  to,
  bare = false,
}: {
  calendar: CalendarDto;
  from: LocalDate;
  to: LocalDate;
  /** Inside another container (a segment): no card, no title. */
  bare?: boolean;
}) {
  const { t, f } = useI18n();
  const w = weekTotals(calendar, from, to);
  const of = (plan: string) => (plan ? ` ${t("planner.stats.ofPlan", { plan })}` : "");
  return (
    <section className={bare ? "week-stats" : "card week-stats"}>
      {!bare && (
        <h3>
          {t("planner.weekStats", { from: f.date(from, "dayMonth"), to: f.date(to, "dayMonth") })}
        </h3>
      )}
      <dl className="week-stats-list">
        <div>
          <dt>{t("planner.stats.sessions")}</dt>
          <dd className="num">
            <strong>{w.sessions.done}</strong> / {w.sessions.planned}
            <Meter done={w.sessions.done} planned={w.sessions.planned} />
          </dd>
        </div>
        {calendar.activitiesVisible && (
          <>
            <div>
              <dt>{t("planner.stats.distance")}</dt>
              <dd className="num">
                <strong>{f.distance(w.distance.done, 1)}</strong>
                <span className="muted">
                  {of(w.distance.planned ? f.distance(w.distance.planned, 1) : "")}
                </span>
                <Meter done={w.distance.done} planned={w.distance.planned} />
              </dd>
            </div>
            <div>
              <dt>{t("planner.stats.time")}</dt>
              <dd className="num">
                <strong>{f.totalTime(w.time.done) || "0"}</strong>
                <span className="muted">
                  {of(w.time.planned ? f.totalTime(w.time.planned) : "")}
                </span>
                <Meter done={w.time.done} planned={w.time.planned} />
              </dd>
            </div>
            <div className="third">
              <dt>{t("planner.stats.elevation")}</dt>
              <dd className="num">{f.elevation(w.elevation)}</dd>
            </div>
            <div className="third">
              <dt>{t("planner.stats.load")}</dt>
              <dd className="num">{w.load}</dd>
            </div>
            <div className="third">
              <dt>{t("planner.stats.avgHr")}</dt>
              <dd className="num">{w.averageHeartRate ?? "—"}</dd>
            </div>
            {w.byGroup.length > 0 && (
              <div>
                <dt>{t("planner.stats.byGroup")}</dt>
                <dd className="stack-s" style={{ marginTop: 6 }}>
                  {w.byGroup.map((g) => (
                    <div key={g.group} className="row small">
                      <SportIcon group={g.group} />
                      <span className="grow num">
                        {g.distance > 0 ? `${f.distance(g.distance, 1)} · ` : ""}
                        {f.totalTime(g.time)}
                      </span>
                      <span className="muted num">× {g.count}</span>
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
    </section>
  );
}
