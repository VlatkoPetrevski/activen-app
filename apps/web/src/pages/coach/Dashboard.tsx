import type { CoachAthleteDto, CoachSignal } from "@activen/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useI18n, type T } from "../../i18n/I18nContext.js";
import type { Formatter } from "@activen/i18n";
import { groupOf } from "../../lib/plan.js";
import { vendorName } from "../../lib/vendors.js";
import { Avatar } from "../../ui/Avatar.js";
import { Dialog } from "../../ui/Dialog.js";
import { Icon, SportIcon } from "../../ui/Icon.js";
import { Empty, QueryView } from "../../ui/States.js";
import { useCoachAthletes } from "./hooks.js";

export function signalText(t: T, f: Formatter, s: CoachSignal): string {
  switch (s.code) {
    case "missed_sessions":
      return t("coachApp.signal.missed", { count: s.count });
    case "high_effort_on_easy_day":
      return t("coachApp.signal.hard", {
        rpe: s.perceivedEffort,
        date: f.date(s.calendarDate, "weekdayShort"),
      });
    case "awaiting_reply":
      return t("coachApp.signal.reply");
  }
}

function InviteDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const api = useApi();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      await api.inviteAthlete(email.trim());
      await queryClient.invalidateQueries({ queryKey: ["coach"] });
      setState("sent");
      setEmail("");
    } catch {
      setState("error");
    }
  };
  return (
    <Dialog
      open={open}
      title={t("coachApp.invite")}
      onClose={() => {
        setState("idle");
        onClose();
      }}
    >
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="invite-email">{t("auth.email.label")}</label>
          <input
            id="invite-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <p className="small muted">{t("coachApp.inviteHint")}</p>
        {state === "sent" && <div className="alert success">{t("coachApp.inviteSent")}</div>}
        {state === "error" && <div className="alert error">{t("common.error")}</div>}
        <div className="sheet-actions">
          <button type="submit" className="btn btn-primary" disabled={state === "busy"}>
            {t("coachApp.invite")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function WeekBar({ row }: { row: CoachAthleteDto }) {
  const { planned, completed } = row.week;
  return (
    <div className="row">
      <div className="progress-track grow">
        <span style={{ width: planned ? `${(completed / planned) * 100}%` : "0%" }} />
      </div>
      <span className="small num">
        {completed}/{planned}
      </span>
    </div>
  );
}

/** "34,5 km / 3 ч 12 мин": everything recorded Monday to today. */
function WeekTotal({ row }: { row: CoachAthleteDto }) {
  const { f } = useI18n();
  const w = row.weekTotals;
  if (!w || w.count === 0) return <span className="small muted">—</span>;
  return (
    <span className="num">
      <strong>{w.distanceInMeters > 0 ? f.distance(w.distanceInMeters, 1) : "—"}</strong>
      <span className="muted"> / {f.totalTime(w.durationInSeconds)}</span>
    </span>
  );
}

export function CoachDashboard() {
  const { t, f } = useI18n();
  const query = useCoachAthletes();
  const [inviting, setInviting] = useState(false);

  return (
    <div className="stack-l">
      <div className="row-between">
        <h1>{t("nav.athletes")}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setInviting(true)}>
          <Icon name="plus" size={18} /> {t("coachApp.invite")}
        </button>
      </div>
      <QueryView query={query}>
        {(rows) => {
          if (rows.length === 0)
            return (
              <section className="card">
                <Empty>{t("coachApp.empty")}</Empty>
              </section>
            );
          const attention = rows.filter((r) => r.signals.length > 0);
          return (
            <>
              <section className="stack">
                <h2>{t("coachApp.attention")}</h2>
                {attention.length === 0 ? (
                  <div className="alert success">{t("coachApp.allGood")}</div>
                ) : (
                  <div className="attention">
                    {attention.map((r) => (
                      <Link
                        key={r.athleteId}
                        to={`/coach/athletes/${r.athleteId}`}
                        className="card stack"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className="row">
                          <Avatar name={r.displayName} />
                          <h3 className="grow">{r.displayName}</h3>
                          <Icon name="chevronRight" size={18} />
                        </div>
                        <div className="row wrap">
                          {r.signals.map((s) => (
                            <span
                              key={s.code}
                              className={`chip ${s.code === "awaiting_reply" ? "teal" : "warn"}`}
                            >
                              {s.code !== "awaiting_reply" && <Icon name="alert" size={14} />}
                              {signalText(t, f, s)}
                            </span>
                          ))}
                        </div>
                        {r.lastComment?.fromAthlete && (
                          <p className="small muted">„{r.lastComment.body}“</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
              <section className="card" style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("coachApp.col.athlete")}</th>
                      <th>{t("coachApp.col.week")}</th>
                      <th className="hide-mobile">{t("coachApp.col.last")}</th>
                      <th>{t("coachApp.col.weekTotal")}</th>
                      <th className="hide-mobile">{t("coachApp.col.source")}</th>
                      <th aria-label={t("common.edit")} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.linkId}>
                        <td>
                          <div className="row">
                            <Avatar name={r.displayName} />
                            <div>
                              <div style={{ fontWeight: 700 }}>{r.displayName}</div>
                              {r.status === "invited" && (
                                <span className="chip">{t("coachApp.invited")}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{r.status === "active" ? <WeekBar row={r} /> : "—"}</td>
                        <td className="hide-mobile">
                          {r.lastActivity ? (
                            <div className="row">
                              <SportIcon group={groupOf(r.lastActivity.activityType)} />
                              <div className="small">
                                <div>{f.date(r.lastActivity.calendarDate, "dayMonth")}</div>
                                <div className="muted">
                                  {r.lastActivity.distanceInMeters
                                    ? f.distance(r.lastActivity.distanceInMeters, 1)
                                    : f.duration(r.lastActivity.durationInSeconds)}
                                  {r.lastActivity.perceivedEffort
                                    ? ` · RPE ${r.lastActivity.perceivedEffort}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="small muted">
                              {r.status === "active" && !r.scopes.includes("activities")
                                ? t("coachApp.noShared")
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="nowrap">
                          <WeekTotal row={r} />
                        </td>
                        <td className="hide-mobile">
                          {r.primarySource ? (
                            <span className="chip">{vendorName(r.primarySource)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {r.status === "active" && (
                            <Link
                              to={`/coach/athletes/${r.athleteId}`}
                              className="icon-btn"
                              aria-label={`${t("common.edit")}: ${r.displayName}`}
                            >
                              <Icon name="chevronRight" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          );
        }}
      </QueryView>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
