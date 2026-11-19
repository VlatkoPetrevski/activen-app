import type { ActivityDto } from "@activen/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { groupOf } from "../lib/plan.js";
import { vendorName } from "../lib/vendors.js";
import { CheckInForm } from "../training/CheckInForm.js";
import { Insights } from "../training/Insights.js";
import { activitySummary, paceOrSpeed, plannedSummary, sportLabel } from "../training/labels.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { QueryView } from "../ui/States.js";

function Metrics({ a }: { a: ActivityDto }) {
  const { t, f } = useI18n();
  const ps = paceOrSpeed(f, a);
  const items: [string, string | null][] = [
    [t("activity.distance"), a.distanceInMeters ? f.distance(a.distanceInMeters) : null],
    [t("activity.duration"), a.durationInSeconds ? f.duration(a.durationInSeconds) : null],
    [
      t("activity.movingTime"),
      a.movingDurationInSeconds ? f.duration(a.movingDurationInSeconds) : null,
    ],
    [ps?.kind === "speed" ? t("activity.speed") : t("activity.pace"), ps?.text ?? null],
    [
      t("activity.avgHr"),
      a.averageHeartRateInBeatsPerMinute ? f.heartRate(a.averageHeartRateInBeatsPerMinute) : null,
    ],
    [
      t("activity.maxHr"),
      a.maxHeartRateInBeatsPerMinute ? f.heartRate(a.maxHeartRateInBeatsPerMinute) : null,
    ],
    [
      t("activity.elevation"),
      a.totalElevationGainInMeters ? f.elevation(a.totalElevationGainInMeters) : null,
    ],
    [t("activity.load"), a.trainingLoad ? f.number(a.trainingLoad, 0) : null],
    [t("activity.power"), a.averagePowerInWatts ? `${Math.round(a.averagePowerInWatts)} W` : null],
    [
      t("activity.calories"),
      a.activeKilocalories ? `${f.number(a.activeKilocalories, 0)} kcal` : null,
    ],
  ];
  return (
    <div className="metrics">
      {items
        .filter(([, v]) => v)
        .map(([label, value]) => (
          <div key={label} className="metric">
            <span className="value">{value}</span>
            <span className="label">{label}</span>
          </div>
        ))}
    </div>
  );
}

export function ActivityPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["me", "activity", id], queryFn: () => api.activity(id) });
  const coaches = useQuery({ queryKey: ["me", "coaches"], queryFn: () => api.coaches() });
  const coach = coaches.data?.find((c) => c.status === "active");

  return (
    <div className="stack-l">
      <Link
        to="/activities"
        className="btn btn-ghost btn-small"
        style={{ alignSelf: "flex-start" }}
      >
        <Icon name="chevronLeft" size={16} /> {t("nav.activities")}
      </Link>
      <QueryView query={query}>
        {({ activity: a, planEntry, comments, insights }) => (
          <>
            <header className="row">
              <SportIcon group={groupOf(a.activityType)} />
              <div className="grow">
                <h1>{a.activityName ?? sportLabel(t, a.activityType)}</h1>
                <span className="muted small">
                  {f.date(a.calendarDate, "full")} · {sportLabel(t, a.activityType)}
                </span>
              </div>
            </header>
            <section className="card stack">
              <Insights insights={insights} />
              <Metrics a={a} />
              <div className="row wrap tiny muted">
                <span>{t("activity.source", { vendor: vendorName(a.source.vendor) })}</span>
                {a.gearName && (
                  <span>
                    · {t("activity.gear")}: {a.gearName}
                  </span>
                )}
              </div>
            </section>
            {planEntry && (
              <section className="card stack">
                <span className="eyebrow">{t("activity.plannedSession")}</span>
                <div className="row-between">
                  <h3>{planEntry.description}</h3>
                  <span className="small muted">{plannedSummary(f, planEntry)}</span>
                </div>
                <div className="small muted">
                  {t("plan.planned")}: {plannedSummary(f, planEntry) || "—"} · {t("plan.actual")}:{" "}
                  {activitySummary(f, a)}
                </div>
                {planEntry.notes && <div className="coach-note small">💬 {planEntry.notes}</div>}
              </section>
            )}
            <CheckInForm
              key={a.id}
              title={t("checkin.title")}
              initial={a.feedback}
              coachName={coach?.coachName ?? null}
              defaultOpen={a.feedback === null}
              onSave={async (input) => {
                await api.saveFeedback(a.id, input);
                await queryClient.invalidateQueries({ queryKey: ["me"] });
              }}
            />
            {comments.length > 0 && (
              <section className="card stack">
                <h2>{t("activity.comments")}</h2>
                {comments.map((c) => (
                  <div key={c.id} className={`bubble${c.authorId === me.user.id ? " mine" : ""}`}>
                    {c.body}
                    <div className="meta">{c.authorName}</div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}
