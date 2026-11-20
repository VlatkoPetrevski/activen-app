import type { CoachAthleteDto } from "@activen/contracts";
import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../../i18n/I18nContext.js";
import { distanceOfPlan } from "../../training/labels.js";
import { Avatar } from "../../ui/Avatar.js";
import { Icon } from "../../ui/Icon.js";
import { Empty, QueryView } from "../../ui/States.js";
import { CoachThread } from "./CoachThread.js";
import { useCoachAthletes } from "./hooks.js";

/** "Оваа недела: 2/5 тренинзи · 16/70 km" — what the coach needs before replying. */
function WeekProgress({ row }: { row: CoachAthleteDto }) {
  const { t, f } = useI18n();
  const parts = [
    t("coachApp.weekProgress", { done: row.week.completed, planned: row.week.planned }),
  ];
  const done = row.weekTotals?.distanceInMeters;
  const planned = row.week.plannedDistanceInMeters;
  if (done !== undefined) parts.push(distanceOfPlan(f, done, planned));
  return <div className="small muted num">{parts.join(" · ")}</div>;
}

export function CoachMessages() {
  const { t } = useI18n();
  const query = useCoachAthletes();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="stack-l">
      <h1>{t("nav.messages")}</h1>
      <QueryView query={query}>
        {(rows) => {
          const active = [...rows.filter((r) => r.status === "active")].sort((a, b) =>
            (b.lastComment?.createdAt ?? "").localeCompare(a.lastComment?.createdAt ?? ""),
          );
          if (active.length === 0 || !active[0])
            return (
              <section className="card">
                <Empty>{t("coachApp.messagesEmpty")}</Empty>
              </section>
            );
          const current = active.find((r) => r.athleteId === selected) ?? active[0];
          if (!current) return null;
          return (
            <div className="coach-grid" style={{ gridTemplateColumns: "minmax(240px, 1fr) 2fr" }}>
              <section className="card list" style={{ padding: 8 }}>
                {active.map((r) => (
                  <button
                    key={r.athleteId}
                    type="button"
                    className="list-item"
                    style={{
                      border: 0,
                      background:
                        r.athleteId === current.athleteId ? "var(--primary-soft)" : "transparent",
                      borderRadius: 12,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    aria-pressed={r.athleteId === current.athleteId}
                    onClick={() => setSelected(r.athleteId)}
                  >
                    <Avatar name={r.displayName} />
                    <span className="grow">
                      <strong>{r.displayName}</strong>
                      <span
                        className="small muted"
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.lastComment?.body ?? "—"}
                      </span>
                    </span>
                    {r.signals.some((s) => s.code === "awaiting_reply") && (
                      <span className="chip teal">•</span>
                    )}
                  </button>
                ))}
              </section>
              <section className="card stack">
                <div className="row thread-head">
                  <Avatar name={current.displayName} />
                  <div className="grow">
                    <h2>{current.displayName}</h2>
                    <WeekProgress row={current} />
                  </div>
                  <Link
                    to={`/coach/athletes/${current.athleteId}`}
                    className="btn btn-secondary btn-small"
                    aria-label={t("coachApp.openProfileOf", { name: current.displayName })}
                  >
                    <Icon name="profile" size={16} /> {t("coachApp.openProfile")}
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
                <CoachThread key={current.athleteId} athleteId={current.athleteId} />
              </section>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
