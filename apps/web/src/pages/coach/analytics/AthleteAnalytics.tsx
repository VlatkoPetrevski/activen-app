import type { ActivityDto, WellnessDto } from "@activen/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useApi } from "../../../api/ApiContext.js";
import { useI18n } from "../../../i18n/I18nContext.js";
import { groupOf } from "../../../lib/plan.js";
import {
  ComplianceDots,
  EffortBar,
  FitnessChart,
  flagText,
  FormBadge,
  LoadChip,
  Sparkbars,
  WeeklyChart,
} from "../../../training/AnalyticsCharts.js";
import { Locked } from "../../../training/ConsentInfo.js";
import { activitySummary } from "../../../training/labels.js";
import { Icon, SportIcon } from "../../../ui/Icon.js";
import { Segment } from "../../../ui/Segment.js";
import { Empty, QueryView } from "../../../ui/States.js";
import { Header, pct } from "./shared.js";

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
