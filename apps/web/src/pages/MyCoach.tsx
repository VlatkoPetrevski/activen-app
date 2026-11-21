import type { CoachLinkDto, ConsentScope } from "@activen/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { ScopePicker } from "../training/ScopePicker.js";
import { Thread } from "../training/Thread.js";
import { Link } from "react-router";
import { todayIn, weekOf } from "../lib/dates.js";
import { distanceOfPlan } from "../training/labels.js";
import { WeekStats, weekTotals } from "../training/WeekStats.js";
import { FormatFields } from "../settings/FormatFields.js";
import { SettingsError } from "../settings/SettingsError.js";
import { useSettingsEditor } from "../settings/useSettingsEditor.js";
import { Avatar } from "../ui/Avatar.js";
import { Dialog } from "../ui/Dialog.js";
import { Icon } from "../ui/Icon.js";
import { Segment } from "../ui/Segment.js";
import { useConfirm } from "../ui/Confirm.js";
import { Empty, QueryView } from "../ui/States.js";

const DEFAULT_SCOPES: ConsentScope[] = ["activities", "comments"];

/** Units and language for everything the athlete and the coach exchange. */
function FormatSettings() {
  const editor = useSettingsEditor();
  return (
    <>
      <div className="form-grid">
        <FormatFields editor={editor} />
      </div>
      <SettingsError show={editor.error} />
    </>
  );
}

function CoachCard({ link }: { link: CoachLinkDto }) {
  const api = useApi();
  const { t, f } = useI18n();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [scopes, setScopes] = useState<ConsentScope[]>(
    link.status === "active" ? link.scopes : DEFAULT_SCOPES,
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me"] });
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setSaved(false);
    try {
      await fn();
      await refresh();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };
  const changed =
    link.status === "active" && [...scopes].sort().join() !== [...link.scopes].sort().join();

  if (link.status === "invited")
    return (
      <section className="card stack">
        <div className="row">
          <Avatar name={link.coachName} large />
          <h2 className="grow">{t("coach.invitation", { name: link.coachName })}</h2>
        </div>
        <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
        <p className="tiny muted">{t("coach.stravaNote")}</p>
        <div className="row wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void act(() => api.acceptCoach(link.linkId, scopes))}
          >
            {t("coach.accept")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void act(() => api.endCoach(link.linkId))}
          >
            {t("coach.decline")}
          </button>
        </div>
      </section>
    );

  return (
    <section className="card stack">
      <div className="row">
        <Avatar name={link.coachName} large />
        <div className="grow">
          <h2>{link.coachName}</h2>
          <span className="small muted">{t("coach.title")}</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => {
            setScopes(link.scopes);
            setSaved(false);
            setSettings(true);
          }}
        >
          <Icon name="settings" size={16} /> {t("coach.settings")}
        </button>
      </div>
      <p className="small muted">
        {link.scopes.length
          ? t("coach.sharing", {
              list: f.list(link.scopes.map((s) => t(`coach.scope.${s}`))),
            })
          : t("coach.sharingNone")}
      </p>
      <Dialog open={settings} title={t("coach.settingsTitle")} onClose={() => setSettings(false)}>
        <div className="stack">
          <h3>{t("coach.privacy")}</h3>
          <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
          <p className="tiny muted">{t("coach.stravaNote")}</p>
          {saved && !changed && <div className="alert success">{t("common.saved")}</div>}
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !changed}
              onClick={() => void act(() => api.updateCoachScopes(link.linkId, scopes))}
            >
              {t("common.save")}
            </button>
          </div>
          <h3>{t("coach.format")}</h3>
          <FormatSettings />
          <h3>{t("coach.relationship")}</h3>
          <div>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void confirm(t("coach.stopConfirm", { name: link.coachName }), {
                  confirmLabel: t("coach.stop"),
                }).then(async (ok) => {
                  if (ok) {
                    setSettings(false);
                    await act(() => api.endCoach(link.linkId));
                  }
                })
              }
            >
              {t("coach.stop")}
            </button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

/** This week at a glance; the planner's week statistics on expand. */
function ProgressSegment() {
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const week = weekOf(todayIn(me.settings.timeZone));
  const query = useQuery({
    queryKey: ["me", "calendar", week.from, week.to],
    queryFn: () => api.calendar(week.from, week.to),
  });
  const w = query.data ? weekTotals(query.data, week.from, week.to) : null;
  return (
    <Segment
      label={t("coach.progress")}
      summary={
        <span className="seg-line">
          <strong>{t("coach.progress")}</strong>
          {w && (
            <span className="small muted num">
              {t("coach.progressSummary", {
                done: w.sessions.done,
                planned: w.sessions.planned,
                distance: distanceOfPlan(f, w.distance.done, w.distance.planned),
              })}
            </span>
          )}
        </span>
      }
    >
      {query.data && (
        <div className="stack">
          <WeekStats calendar={query.data} from={week.from} to={week.to} bare />
          <Link to="/progress" className="back-link">
            {t("coach.progressMore")} <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      )}
    </Segment>
  );
}

export function MyCoachPage() {
  const api = useApi();
  const me = useMe();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const coaches = useQuery({ queryKey: ["me", "coaches"], queryFn: () => api.coaches() });
  const active = coaches.data?.some((c) => c.status === "active") ?? false;
  const comments = useQuery({
    queryKey: ["me", "comments"],
    queryFn: () => api.comments(),
    enabled: active,
  });

  return (
    <div className="stack-l">
      <h1>{t("coach.title")}</h1>
      <QueryView query={coaches}>
        {(list) =>
          list.length === 0 ? (
            <section className="card">
              <Empty>{t("coach.none")}</Empty>
            </section>
          ) : (
            <>
              {list.map((l) => (
                <CoachCard key={l.linkId} link={l} />
              ))}
            </>
          )
        }
      </QueryView>
      {active && (
        <div className="segments">
          <ProgressSegment />
        </div>
      )}
      {active && (
        <section className="card stack">
          <h2>{t("coach.thread")}</h2>
          <QueryView query={comments}>
            {(list) => (
              <Thread
                comments={list}
                myId={me.user.id}
                onSend={async (body) => {
                  await api.postComment({ body });
                  await queryClient.invalidateQueries({ queryKey: ["me", "comments"] });
                }}
              />
            )}
          </QueryView>
        </section>
      )}
    </div>
  );
}
