import type { CoachLinkDto, WellnessDto } from "@activen/contracts";
import { trainingReadinessLevel, type LocalDate } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { todayIn, weekOf } from "../lib/dates.js";
import { buildDays, groupOf, type DayEntry } from "../lib/plan.js";
import { plannedSummary, activitySummary } from "../training/labels.js";
import { Structure } from "../training/Structure.js";
import { WeekStrip } from "../training/WeekStrip.js";
import { Avatar } from "../ui/Avatar.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { Ring } from "../ui/Ring.js";
import { Loading, QueryView } from "../ui/States.js";

function greetingKey(now: Date): MessageKey {
  const h = now.getHours();
  return h < 11
    ? "today.greeting.morning"
    : h < 18
      ? "today.greeting.day"
      : "today.greeting.evening";
}

function Readiness({ wellness }: { wellness: WellnessDto | null }) {
  const { t, f } = useI18n();
  if (!wellness || wellness.trainingReadiness === null)
    return (
      <section className="card warm stack">
        <div className="row">
          <Icon name="battery" />
          <h2>{t("trainingReadiness.title")}</h2>
        </div>
        <p className="muted">{t("today.readiness.noData")}</p>
        <div className="row wrap">
          {["Garmin", "Polar", "Suunto", "COROS"].map((v) => (
            <span key={v} className="chip">
              {v}
            </span>
          ))}
        </div>
      </section>
    );
  const level = trainingReadinessLevel(Math.max(1, wellness.trainingReadiness));
  const hrvKey =
    `hrvStatus.${wellness.hrvStatus === "none" ? "NO_STATUS" : wellness.hrvStatus.toUpperCase()}` as MessageKey;
  return (
    <section className="card stack">
      <div className="readiness">
        <Ring
          value={wellness.trainingReadiness}
          label={`${t("trainingReadiness.title")}: ${wellness.trainingReadiness}`}
        />
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{t("trainingReadiness.title")}</span>
          <h2>{t(`trainingReadiness.level.${level}`)}</h2>
          <p className="muted small">{t(`trainingReadiness.message.${level}`)}</p>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="row small muted">
            <Icon name="sleep" size={16} /> {t("today.sleep")}
          </div>
          <div className="value">
            {f.duration(wellness.sleepDurationInSeconds).replace(/:\d\d$/, "")} h
          </div>
          {wellness.sleepScore !== null && (
            <div className="tiny muted">
              {t("today.sleepScore", { score: wellness.sleepScore })}
            </div>
          )}
        </div>
        <div className="tile">
          <div className="row small muted">
            <Icon name="hrv" size={16} /> {t("today.hrv")}
          </div>
          <div className="value">{wellness.lastNightHrvMs ?? "—"} ms</div>
          <div className="tiny muted">{t(hrvKey)}</div>
        </div>
        <div className="tile">
          <div className="row small muted">
            <Icon name="heart" size={16} /> {t("today.restingHr")}
          </div>
          <div className="value">{wellness.restingHeartRate ?? "—"}</div>
          <div className="tiny muted">bpm</div>
        </div>
        <div className="tile">
          <div className="row small muted">
            <Icon name="battery" size={16} /> {t("today.recovery")}
          </div>
          <div className="value">
            {wellness.recoveryTimeInMinutes !== null
              ? `${Math.round(wellness.recoveryTimeInMinutes / 60)} h`
              : "—"}
          </div>
        </div>
      </div>
    </section>
  );
}

function TodayEntry({ d, coach }: { d: DayEntry; coach: CoachLinkDto | undefined }) {
  const { t, f } = useI18n();
  const { entry, activity } = d;
  return (
    <div className="stack">
      <div className="row">
        <SportIcon group={entry.kind === "rest" ? "rest" : groupOf(entry.plannedActivityType)} />
        <div className="grow">
          <h3>{entry.description}</h3>
          <div className="small muted">
            {activity ? activitySummary(f, activity) : plannedSummary(f, entry)}
          </div>
        </div>
        {d.status === "done" && <span className="chip good">{t("today.done")}</span>}
      </div>
      {entry.kind === "rest" ? (
        <p className="small muted">{t("today.restDay")}</p>
      ) : (
        <Structure entry={entry} />
      )}
      {entry.notes && (
        <div className="coach-note">
          <Avatar name={coach?.coachName ?? "?"} />
          <div className="stack" style={{ gap: 2 }}>
            {coach && (
              <span className="tiny muted">
                {t("today.coachNote", { name: coach.coachName.split(" ")[0] ?? "" })}
              </span>
            )}
            <span className="small">{entry.notes}</span>
          </div>
        </div>
      )}
      {activity && (
        <Link className="btn btn-secondary btn-small" to={`/activities/${activity.id}`}>
          {activity.feedback ? t("common.edit") : t("today.checkIn")}
        </Link>
      )}
    </div>
  );
}

export function TodayPage() {
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const today: LocalDate = todayIn(me.settings.timeZone);
  const week = weekOf(today);
  const wellness = useQuery({
    queryKey: ["me", "wellness", today],
    queryFn: () => api.wellness(today),
  });
  const calendar = useQuery({
    queryKey: ["me", "calendar", week.from, week.to],
    queryFn: () => api.calendar(week.from, week.to),
  });
  const coaches = useQuery({ queryKey: ["me", "coaches"], queryFn: () => api.coaches() });
  const coach = coaches.data?.find((c) => c.status === "active");
  const firstName = me.user.displayName.split(" ")[0] ?? me.user.displayName;

  return (
    <div className="stack-l">
      <header className="stack" style={{ gap: 2 }}>
        <span className="muted small">{f.date(today, "long")}</span>
        <h1>{t(greetingKey(new Date()), { name: firstName })}</h1>
      </header>

      {wellness.isPending ? <Loading /> : <Readiness wellness={wellness.data ?? null} />}

      <QueryView query={calendar}>
        {(cal) => {
          const days = buildDays(cal, week.days, today);
          const todayView = days.find((d) => d.date === today);
          const done = days.flatMap((d) => d.entries).filter((e) => e.status === "done");
          const workouts = days.flatMap((d) => d.entries).filter((e) => e.status !== "rest");
          const distance = cal.activities
            .filter((a) => a.calendarDate <= today)
            .reduce((s, a) => s + (a.distanceInMeters ?? 0), 0);
          const pending = [...cal.activities]
            .filter((a) => a.calendarDate < today && !a.feedback)
            .sort((a, b) => b.startTimeInSeconds - a.startTimeInSeconds)[0];
          return (
            <>
              <section className="card stack">
                <div className="card-title" style={{ marginBottom: 0 }}>
                  <h2>{t("today.planToday")}</h2>
                  <Link to="/plan" className="btn btn-ghost btn-small">
                    {t("nav.plan")} <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
                {todayView && todayView.entries.length > 0 ? (
                  todayView.entries.map((d) => <TodayEntry key={d.entry.id} d={d} coach={coach} />)
                ) : (
                  <div className="row-between">
                    <p className="muted">{t("today.noPlan")}</p>
                    <Link to="/plan" className="btn btn-secondary btn-small">
                      <Icon name="plus" size={16} /> {t("today.addPlan")}
                    </Link>
                  </div>
                )}
              </section>

              {pending && (
                <section className="card warm row-between">
                  <div className="stack" style={{ gap: 2 }}>
                    <h3>{t("today.checkInPrompt")}</h3>
                    <span className="small muted">
                      {f.date(pending.calendarDate, "long")} · {activitySummary(f, pending)}
                    </span>
                  </div>
                  <Link className="btn btn-primary btn-small" to={`/activities/${pending.id}`}>
                    {t("today.checkIn")}
                  </Link>
                </section>
              )}

              <section className="card stack">
                <div className="row-between">
                  <h2>{t("today.week")}</h2>
                  <span className="small muted num">
                    {t("today.weekProgress", {
                      done: done.length,
                      planned: workouts.length,
                      distance: f.distance(distance, 1),
                    })}
                  </span>
                </div>
                <WeekStrip days={days} today={today} />
              </section>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
