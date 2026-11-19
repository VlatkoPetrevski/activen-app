import type { CoachLinkDto, ConsentScope } from "@activen/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { ScopePicker } from "../training/ScopePicker.js";
import { Thread } from "../training/Thread.js";
import { Avatar } from "../ui/Avatar.js";
import { useConfirm } from "../ui/Confirm.js";
import { Empty, QueryView } from "../ui/States.js";

const DEFAULT_SCOPES: ConsentScope[] = ["activities", "comments"];

function CoachCard({ link }: { link: CoachLinkDto }) {
  const api = useApi();
  const { t } = useI18n();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [scopes, setScopes] = useState<ConsentScope[]>(
    link.status === "active" ? link.scopes : DEFAULT_SCOPES,
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
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

  return (
    <section className="card stack">
      <div className="row">
        <Avatar name={link.coachName} large />
        <div className="grow">
          <h2>
            {link.status === "invited"
              ? t("coach.invitation", { name: link.coachName })
              : link.coachName}
          </h2>
          {link.status === "active" && <span className="small muted">{t("coach.title")}</span>}
        </div>
      </div>
      <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
      <p className="tiny muted">{t("coach.stravaNote")}</p>
      {saved && !changed && link.status === "active" && (
        <div className="alert success">{t("common.saved")}</div>
      )}
      <div className="row wrap">
        {link.status === "invited" ? (
          <>
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
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !changed}
              onClick={() => void act(() => api.updateCoachScopes(link.linkId, scopes))}
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void confirm(t("coach.stopConfirm", { name: link.coachName }), {
                  confirmLabel: t("coach.stop"),
                }).then(async (ok) => {
                  if (ok) await act(() => api.endCoach(link.linkId));
                })
              }
            >
              {t("coach.stop")}
            </button>
          </>
        )}
      </div>
    </section>
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
