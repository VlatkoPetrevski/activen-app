import type { CoachLinkDto, MorningInputDto } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { QueryView } from "../ui/States.js";
import { BriefingCard, hasDeviceNight } from "../training/BriefingCard.js";
import { ReadinessSegment } from "../training/ReadinessSegment.js";
import { WeatherSegment } from "../training/WeatherSegment.js";
import { StructureLine } from "../training/WorkoutSteps.js";

function greetingKey(now: Date): MessageKey {
  const h = now.getHours();
  return h < 11
    ? "today.greeting.morning"
    : h < 18
      ? "today.greeting.day"
      : "today.greeting.evening";
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
        <>
          <Structure entry={entry} />
          <StructureLine structure={entry.structure} />
        </>
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
  const queryClient = useQueryClient();
  const me = useMe();
  const { t, f } = useI18n();
  const today: LocalDate = todayIn(me.settings.timeZone);
  const week = weekOf(today);
  const briefing = useQuery({
    queryKey: ["me", "briefing", today],
    queryFn: () => api.briefing(today),
  });
  const saveMorning = async (input: MorningInputDto | null) => {
    const next = await api.saveMorningInput(
      today,
      input ?? { sleepDurationInSeconds: null, sleepQuality: null },
    );
    queryClient.setQueryData(["me", "briefing", today], next);
  };
  // The sleep tile's edit button opens the entry in the briefing card below it.
  const [editingSleep, setEditingSleep] = useState(false);
  const canEditSleep = !!briefing.data && !hasDeviceNight(briefing.data);
  const editSleep = () => {
    setEditingSleep(true);
    requestAnimationFrame(() =>
      document
        .getElementById("morning-briefing")
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
    );
  };
  const calendar = useQuery({
    queryKey: ["me", "calendar", week.from, week.to],
    queryFn: () => api.calendar(week.from, week.to),
  });
  const coaches = useQuery({ queryKey: ["me", "coaches"], queryFn: () => api.coaches() });
  const coach = coaches.data?.find((c) => c.status === "active");
  const firstName = me.user.displayName.split(" ")[0] ?? me.user.displayName;

  const head = (
    <header className="today-head">
      <h1>{t(greetingKey(new Date()), { name: firstName })}</h1>
      <span className="muted small">{f.date(today, "long")}</span>
    </header>
  );
  const readinessBlock = (
    <div className="segments">
      <WeatherSegment timeZone={me.settings.timeZone} />
      {briefing.isPending ? (
        <div className="segment skeleton" aria-hidden />
      ) : (
        <ReadinessSegment
          briefing={briefing.data ?? null}
          onEditSleep={canEditSleep ? editSleep : undefined}
        />
      )}
    </div>
  );

  // Phones: one column. Desktop: everything in one window — the morning on the left, today's
  // session and the week on the right, the greeting up beside the logo.
  return (
    <div className="today">
      {head}
      <QueryView query={calendar}>
        {(cal) => {
          const days = buildDays(cal, week.days, today);
          const todayView = days.find((d) => d.date === today);
          const done = days.flatMap((d) => d.entries).filter((e) => e.status === "done");
          const workouts = days.flatMap((d) => d.entries).filter((e) => e.status !== "rest");
          const distance = cal.activities
            .filter((a) => a.calendarDate <= today)
            .reduce((s, a) => s + (a.distanceInMeters ?? 0), 0);

          return (
            <div className="today-grid">
              <div className="today-morning stack-l">
                {readinessBlock}
                {briefing.data && (
                  <div id="morning-briefing">
                    <BriefingCard
                      briefing={briefing.data}
                      onSaveMorning={saveMorning}
                      editing={editingSleep}
                      onEditingChange={setEditingSleep}
                    />
                  </div>
                )}
              </div>
              <div className="today-day stack-l">
                <section className="card stack">
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    <h2>{t("today.planToday")}</h2>
                    <Link to="/plan" className="btn btn-ghost btn-small">
                      {t("nav.plan")} <Icon name="chevronRight" size={16} />
                    </Link>
                  </div>
                  {todayView && todayView.entries.length > 0 ? (
                    todayView.entries.map((d) => (
                      <TodayEntry key={d.entry.id} d={d} coach={coach} />
                    ))
                  ) : (
                    <div className="row-between">
                      <p className="muted">{t("today.noPlan")}</p>
                      <Link to="/plan" className="btn btn-secondary btn-small">
                        <Icon name="plus" size={16} /> {t("today.addPlan")}
                      </Link>
                    </div>
                  )}
                </section>

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
              </div>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
