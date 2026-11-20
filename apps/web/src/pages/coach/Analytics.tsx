import type {
  ActivityDto,
  AnalyticsSummaryDto,
  AthleteAnalyticsDto,
  WellnessDto,
} from "@activen/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { groupOf } from "../../lib/plan.js";
import { ActivityStats } from "../../training/ActivityStats.js";
import {
  ComplianceDots,
  EffortBar,
  FitnessChart,
  flagText,
  FormBadge,
  LoadChip,
  Sparkbars,
  WeeklyChart,
} from "../../training/AnalyticsCharts.js";
import { ConsentInfo, Locked } from "../../training/ConsentInfo.js";
import { Insights } from "../../training/Insights.js";
import { activitySummary } from "../../training/labels.js";
import { RouteMap } from "../../training/RouteMap.js";
import { Avatar } from "../../ui/Avatar.js";
import { Icon, SportIcon } from "../../ui/Icon.js";
import { Segment } from "../../ui/Segment.js";
import { Empty, QueryView } from "../../ui/States.js";

const pct = (done: number, planned: number) =>
  planned ? Math.round((done / planned) * 100) : null;

/** One athlete in the overview: the essentials in a row, the reasons on expand. */
function RosterRow({ r }: { r: AnalyticsSummaryDto }) {
  const { t, f } = useI18n();
  const plan = r.activitiesVisible ? pct(r.completion28.done, r.completion28.planned) : null;
  const thisWeek = r.weeklyDistance.at(-1) ?? 0;
  return (
    <Segment
      label={t("analytics.openAthlete", { name: r.displayName })}
      summary={
        <span className="roster-row">
          <span className="row roster-name">
            <Avatar name={r.displayName} />
            <strong>{r.displayName}</strong>
          </span>
          <ComplianceDots days={r.last7} />
          <span className="roster-cell">
            <span className="tiny muted">{t("analytics.col.plan")}</span>
            <strong className="num">{plan === null ? "—" : `${plan}%`}</strong>
          </span>
          <span className="roster-cell hide-mobile">
            <span className="tiny muted">{t("analytics.col.load")}</span>
            {r.loadRatio ? <LoadChip ratio={r.loadRatio.value} level={r.loadRatio.level} /> : "—"}
          </span>
          <span className="roster-cell hide-mobile">
            <span className="tiny muted">{t("analytics.col.form")}</span>
            {r.form === null ? "—" : <FormBadge form={r.form} />}
          </span>
          <span className="roster-flags">
            {!r.activitiesVisible ? (
              <span className="chip">
                <Icon name="lock" size={14} /> {t("analytics.notShared")}
              </span>
            ) : r.flags.length ? (
              <span
                className={`chip ${r.flags.some((x) => x.code === "load_high" || x.code === "long_run_spike") ? "bad" : "warn"}`}
              >
                <Icon name="alert" size={14} /> {r.flags.length}
              </span>
            ) : (
              <span className="chip good">
                <Icon name="check" size={14} />
              </span>
            )}
          </span>
        </span>
      }
    >
      <div className="stack">
        {r.flags.length > 0 && (
          <ul className="flag-list">
            {r.flags.map((flag) => (
              <li
                key={flag.code}
                className={
                  flag.code === "load_high" || flag.code === "long_run_spike" ? "bad" : "warn"
                }
              >
                <Icon name="alert" size={16} /> {flagText(t, f, flag)}
              </li>
            ))}
          </ul>
        )}
        {r.activitiesVisible && (
          <div className="roster-details">
            <div>
              <span className="tiny muted">{t("analytics.col.volume")}</span>
              <div className="row">
                <Sparkbars values={r.weeklyDistance} label={t("analytics.col.volume")} />
                <span className="small num">{f.distance(thisWeek, 1)}</span>
              </div>
            </div>
            <div>
              <span className="tiny muted">{t("analytics.col.effort")}</span>
              <div className="small num">
                {r.effort7.averageRpe === null
                  ? t("analytics.effort.none")
                  : t("analytics.effort", {
                      rpe: f.number(r.effort7.averageRpe, 1),
                      hard: r.effort7.hard,
                    })}
              </div>
            </div>
            <div className="show-mobile">
              <span className="tiny muted">{t("analytics.col.load")}</span>
              <div>
                {r.loadRatio ? (
                  <LoadChip ratio={r.loadRatio.value} level={r.loadRatio.level} />
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="show-mobile">
              <span className="tiny muted">{t("analytics.col.form")}</span>
              <div>{r.form === null ? "—" : <FormBadge form={r.form} />}</div>
            </div>
            <div>
              <span className="tiny muted">{t("coachApp.col.last")}</span>
              <div className="small">
                {r.lastActivityDate ? f.date(r.lastActivityDate, "dayMonth") : "—"}
              </div>
            </div>
          </div>
        )}
        <div className="row-between">
          <ConsentInfo name={r.displayName} scopes={r.scopes} withLabel />
          <Link to={`/coach/analytics/${r.athleteId}`} className="btn btn-primary btn-small">
            {t("analytics.openAthlete", { name: r.displayName })}
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      </div>
    </Segment>
  );
}

/** The team at a glance: KPI tiles, then one expandable row per athlete (attention first). */
export function CoachAnalytics() {
  const api = useApi();
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["coach", "analytics"], queryFn: () => api.coachAnalytics() });
  return (
    <div className="stack-l">
      <div>
        <h1>{t("nav.analytics")}</h1>
        <p className="muted">{t("analytics.subtitle")}</p>
      </div>
      <QueryView query={query}>
        {(rows) => {
          if (rows.length === 0)
            return (
              <section className="card">
                <Empty>{t("coachApp.empty")}</Empty>
              </section>
            );
          const shared = rows.filter((r) => r.activitiesVisible);
          const done = shared.reduce((s, r) => s + r.completion28.done, 0);
          const planned = shared.reduce((s, r) => s + r.completion28.planned, 0);
          return (
            <>
              <div className="kpi-tiles">
                <div className="kpi-tile">
                  <span className="value num">{rows.length}</span>
                  <span className="label">{t("analytics.kpi.athletes")}</span>
                </div>
                <div className="kpi-tile">
                  <span className="value num">{pct(done, planned) ?? "—"}%</span>
                  <span className="label">{t("analytics.kpi.compliance")}</span>
                </div>
                <div className="kpi-tile">
                  <span className="value num">
                    {rows.filter((r) => r.loadRatio?.level === "high").length}
                  </span>
                  <span className="label">{t("analytics.kpi.loadHigh")}</span>
                </div>
                <div className="kpi-tile">
                  <span className="value num">{rows.filter((r) => r.longRunSpike).length}</span>
                  <span className="label">{t("analytics.kpi.spikes")}</span>
                </div>
              </div>
              <div className="segments roster">
                {rows.map((r) => (
                  <RosterRow key={r.athleteId} r={r} />
                ))}
              </div>
              <p className="tiny muted">
                {t("analytics.load.hint")} {t("analytics.spike.hint")}
              </p>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

/** Activities of the athlete, filterable by sport; a row opens the activity analysis. */
function ActivityList({ athleteId, activities }: { athleteId: string; activities: ActivityDto[] }) {
  const { t, f } = useI18n();
  const groups = useMemo(
    () => [...new Set(activities.map((a) => groupOf(a.activityType)))],
    [activities],
  );
  const [group, setGroup] = useState<string>("all");
  const [limit, setLimit] = useState(10);
  const all = activities.filter((a) => group === "all" || groupOf(a.activityType) === group);
  const list = all.slice(0, limit);
  return (
    <div className="stack">
      {groups.length > 1 && (
        <div className="chips" role="group" aria-label={t("activities.filters")}>
          {["all", ...groups].map((g) => (
            <button
              key={g}
              type="button"
              className="chip chip-button"
              aria-pressed={group === g}
              onClick={() => {
                setGroup(g);
                setLimit(10);
              }}
            >
              {g === "all" ? t("activities.filter.all") : t(`activityGroup.${g}` as never)}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <Empty>{t("analytics.activities.empty")}</Empty>
      ) : (
        <ul className="an-activities">
          {list.map((a) => (
            <li key={a.id}>
              <Link to={`/coach/analytics/${athleteId}/activities/${a.id}`} className="an-activity">
                <SportIcon group={groupOf(a.activityType)} />
                <span className="grow">
                  <span className="row-between">
                    <strong>{a.activityName}</strong>
                    <span className="tiny muted">{f.date(a.calendarDate, "dayMonth")}</span>
                  </span>
                  <span className="small muted num" style={{ display: "block" }}>
                    {activitySummary(f, a)}
                    {a.averageHeartRateInBeatsPerMinute !== null &&
                      ` · ♥ ${a.averageHeartRateInBeatsPerMinute}`}
                    {a.feedback?.perceivedEffort ? ` · RPE ${a.feedback.perceivedEffort}` : ""}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {all.length > list.length && (
        <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + 20)}>
          {t("activities.loadMore")} ({all.length - list.length})
        </button>
      )}
    </div>
  );
}

function Header({
  data,
  back,
}: {
  data: { displayName: string; scopes: AthleteAnalyticsDto["summary"]["scopes"] };
  back: { to: string; label: string };
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Link to={back.to} className="back-link">
        <Icon name="chevronLeft" size={16} /> {back.label}
      </Link>
      <div className="row">
        <Avatar name={data.displayName} />
        <h1 className="grow">{data.displayName}</h1>
        <ConsentInfo name={data.displayName} scopes={data.scopes} />
      </div>
    </div>
  );
}

/** One athlete: key numbers first, every chart one tap away. */
export function CoachAthleteAnalytics() {
  const api = useApi();
  const { t, f } = useI18n();
  const { athleteId = "" } = useParams();
  const query = useQuery({
    queryKey: ["athlete", athleteId, "analytics"],
    queryFn: () => api.athleteAnalytics(athleteId),
  });
  return (
    <QueryView query={query}>
      {(a) => {
        const s = a.summary;
        const last4 = a.weeks.slice(-4);
        const dist28 = last4.reduce((x, w) => x + w.distanceInMeters, 0);
        const time28 = last4.reduce((x, w) => x + w.durationInSeconds, 0);
        const plan = pct(s.completion28.done, s.completion28.planned);
        const effortTotal = a.effort.easy + a.effort.moderate + a.effort.hard;
        const latest = a.wellness?.at(-1);
        return (
          <div className="stack-l">
            <Header
              data={{ displayName: s.displayName, scopes: s.scopes }}
              back={{ to: "/coach/analytics", label: t("nav.analytics") }}
            />
            {!s.activitiesVisible && <Locked>{t("consent.missing.activities")}</Locked>}
            <div className="kpi-tiles">
              <div className="kpi-tile">
                <span className="value num">{plan === null ? "—" : `${plan}%`}</span>
                <span className="label">{t("analytics.kpi.plan28")}</span>
                <ComplianceDots days={s.last7} />
              </div>
              <div className="kpi-tile">
                <span className="value num">
                  {s.activitiesVisible ? f.distance(dist28, 0) : "—"}
                </span>
                <span className="label">{t("analytics.kpi.distance28")}</span>
                <span className="tiny muted num">
                  {s.activitiesVisible ? f.totalTime(time28) : ""}
                </span>
              </div>
              <div className="kpi-tile">
                <span className="value">
                  {s.loadRatio ? (
                    <LoadChip ratio={s.loadRatio.value} level={s.loadRatio.level} />
                  ) : (
                    "—"
                  )}
                </span>
                <span className="label">{t("analytics.kpi.ratio")}</span>
              </div>
              <div className="kpi-tile">
                <span className="value">{s.form === null ? "—" : <FormBadge form={s.form} />}</span>
                <span className="label">{t("analytics.kpi.form")}</span>
              </div>
              <div className="kpi-tile">
                <span className="value num">
                  {s.effort7.averageRpe === null ? "—" : f.number(s.effort7.averageRpe, 1)}
                </span>
                <span className="label">{t("analytics.kpi.rpe7")}</span>
              </div>
            </div>

            {s.flags.length > 0 && (
              <ul className="flag-list">
                {s.flags.map((flag) => (
                  <li
                    key={flag.code}
                    className={
                      flag.code === "load_high" || flag.code === "long_run_spike" ? "bad" : "warn"
                    }
                  >
                    <Icon name="alert" size={16} />
                    <span>
                      {flagText(t, f, flag)}
                      {flag.code === "long_run_spike" && s.longRunSpike && (
                        <span className="small muted" style={{ display: "block" }}>
                          {t("analytics.spike.detail", {
                            distance: f.distance(s.longRunSpike.distanceInMeters, 1),
                            previous: f.distance(s.longRunSpike.previousLongestInMeters, 1),
                          })}
                          . {t("analytics.spike.hint")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {s.activitiesVisible && (
              <div className="segments">
                <Segment
                  label={t("analytics.weekly")}
                  summary={
                    <span className="seg-line">
                      <strong>{t("analytics.weekly")}</strong>
                      <Sparkbars
                        values={a.weeks.map((w) => w.distanceInMeters)}
                        label={t("analytics.weekly")}
                      />
                    </span>
                  }
                >
                  <WeeklyChart weeks={a.weeks} />
                  <p className="tiny muted">{t("analytics.weekly.label")}</p>
                </Segment>
                <Segment
                  label={t("analytics.fitness")}
                  summary={
                    <span className="seg-line">
                      <strong>{t("analytics.fitness")}</strong>
                      {s.form !== null && <FormBadge form={s.form} />}
                    </span>
                  }
                >
                  <FitnessChart points={a.fitness} />
                  <p className="tiny muted">{t("analytics.form.hint")}</p>
                </Segment>
                <Segment
                  label={t("analytics.effortTitle")}
                  summary={
                    <span className="seg-line">
                      <strong>{t("analytics.effortTitle")}</strong>
                      <span className="small muted num">
                        {effortTotal
                          ? `${t("analytics.effort.hard")}: ${Math.round((a.effort.hard / effortTotal) * 100)}%`
                          : t("analytics.effort.none")}
                      </span>
                    </span>
                  }
                >
                  <EffortBar effort={a.effort} />
                  <p className="tiny muted">{t("analytics.effort.hint")}</p>
                </Segment>
                <Segment
                  label={t("analytics.sports")}
                  summary={
                    <span className="seg-line">
                      <strong>{t("analytics.sports")}</strong>
                      <span className="row" style={{ gap: 4 }}>
                        {a.byGroup.slice(0, 4).map((g) => (
                          <SportIcon key={g.group} group={g.group} />
                        ))}
                      </span>
                    </span>
                  }
                >
                  <ul className="sport-mix">
                    {a.byGroup.map((g) => (
                      <li key={g.group}>
                        <span className="grow">{t(`activityGroup.${g.group}` as never)}</span>
                        <span className="num">
                          {g.distanceInMeters > 0 ? `${f.distance(g.distanceInMeters, 1)} · ` : ""}
                          {f.totalTime(g.durationInSeconds)} · × {g.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Segment>
                <Segment
                  label={t("analytics.wellness")}
                  summary={
                    <span className="seg-line">
                      <strong>{t("analytics.wellness")}</strong>
                      {a.wellness === null ? (
                        <Icon name="lock" size={16} />
                      ) : latest ? (
                        <span className="small muted num">
                          HRV {latest.lastNightHrvMs ?? "—"} · {t("analytics.wellness.sleep")}{" "}
                          {latest.sleepScore ?? "—"} · ♥ {latest.restingHeartRate ?? "—"}
                        </span>
                      ) : null}
                    </span>
                  }
                >
                  {a.wellness === null ? (
                    <Locked>{t("analytics.wellness.locked")}</Locked>
                  ) : a.wellness.length === 0 ? (
                    <p className="small muted">{t("analytics.wellness.empty")}</p>
                  ) : (
                    <div className="wellness-grid">
                      {(
                        [
                          ["hrv", (w: WellnessDto) => w.lastNightHrvMs],
                          ["sleep", (w: WellnessDto) => w.sleepScore],
                          ["rhr", (w: WellnessDto) => w.restingHeartRate],
                        ] as const
                      ).map(([k, pick]) => {
                        const values = (a.wellness ?? []).map((w) => pick(w) ?? 0);
                        return (
                          <div key={k}>
                            <span className="tiny muted">{t(`analytics.wellness.${k}`)}</span>
                            <div className="row">
                              <Sparkbars values={values} label={t(`analytics.wellness.${k}`)} />
                              <strong className="num">{values.at(-1) ?? "—"}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Segment>
              </div>
            )}

            {s.activitiesVisible && (
              <section className="card stack">
                <h2>{t("analytics.activities")}</h2>
                <ActivityList athleteId={athleteId} activities={a.activities} />
              </section>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}

/** One activity for the coach: map (with consent), the athlete's check-in, stats, exercises. */
export function CoachActivityAnalytics() {
  const api = useApi();
  const { t, f } = useI18n();
  const { athleteId = "", activityId = "" } = useParams();
  const analytics = useQuery({
    queryKey: ["athlete", athleteId, "analytics"],
    queryFn: () => api.athleteAnalytics(athleteId),
  });
  const query = useQuery({
    queryKey: ["athlete", athleteId, "activity", activityId],
    queryFn: () => api.athleteActivity(athleteId, activityId),
  });
  const scopes = analytics.data?.summary.scopes ?? [];
  const name = analytics.data?.summary.displayName ?? "";
  return (
    <QueryView query={query}>
      {(d) => {
        const a = d.activity;
        const indoors = !a.distanceInMeters || a.activityType === "TREADMILL_RUNNING";
        const fb = a.feedback;
        return (
          <div className="stack-l">
            <Header
              data={{ displayName: name, scopes }}
              back={{ to: `/coach/analytics/${athleteId}`, label: name || t("nav.analytics") }}
            />
            <section className="card stack">
              <div className="row">
                <SportIcon group={groupOf(a.activityType)} />
                <div className="grow">
                  <h2>{a.activityName}</h2>
                  <div className="small muted num">
                    {f.date(a.calendarDate, "long")} · {activitySummary(f, a)}
                  </div>
                </div>
              </div>
              {d.route ? (
                <RouteMap
                  route={d.route}
                  distanceInMeters={a.distanceInMeters}
                  tiles={api.mode === "http"}
                  height={260}
                />
              ) : !indoors && !scopes.includes("location") ? (
                <Locked>{t("analytics.map.locked")}</Locked>
              ) : !indoors ? null : (
                <p className="small muted">{t("analytics.map.none")}</p>
              )}
              {d.insights.length > 0 && <Insights insights={d.insights} />}
            </section>

            <div className="segments">
              <Segment
                defaultOpen={Boolean(fb?.comment) || d.comments.length > 0}
                label={t("analytics.checkin")}
                summary={
                  <span className="seg-line">
                    <strong>{t("analytics.checkin")}</strong>
                    <span className="small muted">
                      {fb?.perceivedEffort
                        ? `RPE ${fb.perceivedEffort}${fb.feel ? ` · ${t(`checkin.feel.${fb.feel}` as never)}` : ""}`
                        : t("analytics.checkin.none")}
                    </span>
                  </span>
                }
              >
                {fb?.comment ? (
                  <blockquote className="checkin-quote">„{fb.comment}“</blockquote>
                ) : (
                  <p className="small muted">
                    {scopes.includes("comments")
                      ? t("analytics.checkin.none")
                      : t("analytics.checkin.hidden")}
                  </p>
                )}
                {d.comments.length > 0 && (
                  <ul className="stack-s" style={{ listStyle: "none", padding: 0 }}>
                    {d.comments.map((c) => (
                      <li key={c.id} className="small">
                        <strong>{c.authorName ?? ""}</strong>: {c.body}
                      </li>
                    ))}
                  </ul>
                )}
              </Segment>
            </div>
            <section className="card">
              <ActivityStats detail={d} hideHeader />
            </section>
          </div>
        );
      }}
    </QueryView>
  );
}
