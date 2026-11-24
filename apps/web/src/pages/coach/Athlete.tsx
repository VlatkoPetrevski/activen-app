import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { todayIn } from "../../lib/dates.js";
import { BriefingCard } from "../../training/BriefingCard.js";
import { PlanWeek } from "../../training/PlanWeek.js";
import { TargetGoalCard, TargetPaces } from "../../training/TargetGoal.js";
import { ProgressView } from "../../training/ProgressView.js";
import { athleteTarget } from "../../training/target.js";
import { Avatar } from "../../ui/Avatar.js";
import { useConfirm } from "../../ui/Confirm.js";
import { Icon } from "../../ui/Icon.js";
import { Segment } from "../../ui/Segment.js";
import { Loading, QueryView } from "../../ui/States.js";
import { CoachThread } from "./CoachThread.js";
import { signalText } from "./Dashboard.js";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { Tabs } from "../../ui/Tabs.js";
import { useCoachAthletes } from "./hooks.js";

export function CoachAthletePage() {
  const { athleteId = "" } = useParams();
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rows = useCoachAthletes();
  const mobile = useIsMobile();
  const row = rows.data?.find((r) => r.athleteId === athleteId);
  const target = useMemo(() => athleteTarget(api, athleteId), [api, athleteId]);
  const shared = row?.scopes.includes("activities") ?? false;
  const sleepShared = row?.scopes.includes("sleep_recovery") ?? false;
  const briefing = useQuery({
    queryKey: ["athlete", athleteId, "briefing"],
    queryFn: () => api.athleteBriefing(athleteId),
    enabled: sleepShared,
  });
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

  const firstName = row.displayName.split(" ")[0] ?? "";
  const endButton = (
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
  );
  const chips = (
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
  );
  const briefingView = sleepShared ? (
    briefing.data && <BriefingCard briefing={briefing.data} title={t("briefing.forCoach")} />
  ) : (
    <div className="alert info">{t("briefing.notShared", { name: row.displayName })}</div>
  );
  const plan = (
    <TargetPaces target={target}>
      <div className="stack-l">
        <TargetGoalCard target={target} today={todayIn(me.settings.timeZone)} />
        <PlanWeek target={target} today={todayIn(me.settings.timeZone)} />
      </div>
    </TargetPaces>
  );
  const progressView = (
    <>
      {shared && (
        <Link to={`/coach/analytics/${athleteId}`} className="btn btn-secondary">
          <Icon name="progress" size={16} /> {t("analytics.openAthlete", { name: row.displayName })}
        </Link>
      )}
      {shared ? (
        <QueryView query={progress}>{(data) => <ProgressView data={data} />}</QueryView>
      ) : (
        <div className="alert info">{t("coachApp.notShared", { name: row.displayName })}</div>
      )}
    </>
  );
  const back = (
    <Link to="/coach" className="btn btn-ghost btn-small" style={{ alignSelf: "flex-start" }}>
      <Icon name="chevronLeft" size={16} /> {t("nav.athletes")}
    </Link>
  );

  if (mobile)
    return (
      <div className="stack-l coach-athlete-mobile">
        {back}
        <header className="row">
          <Avatar name={row.displayName} />
          <h1 className="grow">{row.displayName}</h1>
        </header>
        {chips}
        {briefingView}
        <Tabs
          label={row.displayName}
          tabs={[
            { key: "plan", title: t("nav.plan"), content: plan },
            {
              key: "messages",
              title: t("nav.messages"),
              content: <CoachThread athleteId={athleteId} />,
            },
            { key: "progress", title: t("nav.progress"), content: progressView },
          ]}
          initial={row.signals.some((x) => x.code === "awaiting_reply") ? "messages" : "plan"}
        />
        <div>{endButton}</div>
      </div>
    );

  return (
    <div className="stack-l">
      {back}
      <header className="row wrap">
        <Avatar name={row.displayName} large />
        <div className="grow">
          <h1>{row.displayName}</h1>
          {chips}
        </div>
        {endButton}
      </header>
      <div className="coach-grid">
        <div className="stack-l">
          <h2>{t("coachApp.planFor", { name: firstName })}</h2>
          {plan}
        </div>
        <div className="stack-l">
          {briefingView}
          <div className="segments">
            <Segment
              defaultOpen={row.signals.some((x) => x.code === "awaiting_reply")}
              label={t("nav.messages")}
              summary={
                <span className="seg-line">
                  <strong>{t("nav.messages")}</strong>
                  {row.lastComment && (
                    <span className="small muted seg-snippet">„{row.lastComment.body}“</span>
                  )}
                </span>
              }
            >
              <CoachThread athleteId={athleteId} />
            </Segment>
          </div>
          {progressView}
        </div>
      </div>
    </div>
  );
}
