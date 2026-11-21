import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useApi } from "../../../api/ApiContext.js";
import { useI18n } from "../../../i18n/I18nContext.js";
import { groupOf } from "../../../lib/plan.js";
import { ActivityStats } from "../../../training/ActivityStats.js";
import { Locked } from "../../../training/ConsentInfo.js";
import { Insights } from "../../../training/Insights.js";
import { activitySummary } from "../../../training/labels.js";
import { RouteMap } from "../../../training/RouteMap.js";
import { SportIcon } from "../../../ui/Icon.js";
import { Segment } from "../../../ui/Segment.js";
import { QueryView } from "../../../ui/States.js";
import { Header } from "./shared.js";

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
