import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { todayIn } from "../../lib/dates.js";
import { PlanWeek } from "../../training/PlanWeek.js";
import { ProgressView } from "../../training/ProgressView.js";
import { athleteTarget } from "../../training/target.js";
import { Avatar } from "../../ui/Avatar.js";
import { useConfirm } from "../../ui/Confirm.js";
import { Icon } from "../../ui/Icon.js";
import { Loading, QueryView } from "../../ui/States.js";
import { CoachThread } from "./CoachThread.js";
import { signalText } from "./Dashboard.js";
import { useCoachAthletes } from "./hooks.js";

export function CoachAthletePage() {
  const { athleteId = "" } = useParams();
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rows = useCoachAthletes();
  const row = rows.data?.find((r) => r.athleteId === athleteId);
  const target = useMemo(() => athleteTarget(api, athleteId), [api, athleteId]);
  const shared = row?.scopes.includes("activities") ?? false;
  const progress = useQuery({
    queryKey: ["athlete", athleteId, "progress", 8],
    queryFn: () => api.athleteProgress(athleteId, 8),
    enabled: shared,
  });

  if (rows.isPending) return <Loading />;
  if (!row || row.status !== "active")
    return (
      <div className="stack">
        <Link to="/coach" className="btn btn-ghost">
          <Icon name="chevronLeft" size={16} /> {t("nav.athletes")}
        </Link>
      </div>
    );

  return (
    <div className="stack-l">
      <Link to="/coach" className="btn btn-ghost btn-small" style={{ alignSelf: "flex-start" }}>
        <Icon name="chevronLeft" size={16} /> {t("nav.athletes")}
      </Link>
      <header className="row wrap">
        <Avatar name={row.displayName} large />
        <div className="grow">
          <h1>{row.displayName}</h1>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {row.scopes.map((s) => (
              <span key={s} className="chip teal">
                {t(`coach.scope.${s}`)}
              </span>
            ))}
            {row.signals.map((s) => (
              <span key={s.code} className="chip warn">
                {signalText(t, f, s)}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-small"
          onClick={() =>
            void confirm(t("coachApp.endConfirm", { name: row.displayName }), {
              confirmLabel: t("coachApp.end"),
            }).then(async (ok) => {
              if (!ok) return;
              await api.endAthlete(athleteId);
              navigate("/coach");
            })
          }
        >
          {t("coachApp.end")}
        </button>
      </header>
      <div className="coach-grid">
        <div className="stack-l">
          <h2>{t("coachApp.planFor", { name: row.displayName.split(" ")[0] ?? "" })}</h2>
          <PlanWeek target={target} today={todayIn(me.settings.timeZone)} />
        </div>
        <div className="stack-l">
          <section className="card stack">
            <h2>{t("nav.messages")}</h2>
            <CoachThread athleteId={athleteId} />
          </section>
          {shared ? (
            <QueryView query={progress}>{(data) => <ProgressView data={data} />}</QueryView>
          ) : (
            <div className="alert info">{t("coachApp.notShared", { name: row.displayName })}</div>
          )}
        </div>
      </div>
    </div>
  );
}
