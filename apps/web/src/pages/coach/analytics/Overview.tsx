import type { AnalyticsSummaryDto } from "@activen/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useApi } from "../../../api/ApiContext.js";
import { useI18n } from "../../../i18n/I18nContext.js";
import {
  ComplianceDots,
  flagText,
  FormBadge,
  LoadChip,
  Sparkbars,
} from "../../../training/AnalyticsCharts.js";
import { ConsentInfo } from "../../../training/ConsentInfo.js";
import { Avatar } from "../../../ui/Avatar.js";
import { Icon } from "../../../ui/Icon.js";
import { Segment } from "../../../ui/Segment.js";
import { Empty, QueryView } from "../../../ui/States.js";
import { pct } from "./shared.js";

/** Coach analytics overview: the whole team, attention first. */
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
