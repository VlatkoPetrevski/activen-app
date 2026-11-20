import type { PlanEntryDto } from "@activen/contracts";
import { addDays, type LocalDate } from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useApi } from "../../api/ApiContext.js";
import { useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { todayIn, weekOf } from "../../lib/dates.js";
import { ActivityStats } from "../../training/ActivityStats.js";
import { MonthCalendar, monthGrid, monthOf } from "../../training/MonthCalendar.js";
import { PlanCompare } from "../../training/PlanCompare.js";
import { PlanEditor } from "../../training/PlanEditor.js";
import { athleteTarget, type PlanTarget } from "../../training/target.js";
import { WeekStats } from "../../training/WeekStats.js";
import { Dialog } from "../../ui/Dialog.js";
import { Icon } from "../../ui/Icon.js";
import { Empty, QueryView } from "../../ui/States.js";
import { useCoachAthletes } from "./hooks.js";

/** Plan vs. done for one athlete: week on the left, month and week totals on the right. */
function AthletePlanner({ target, today }: { target: PlanTarget; today: LocalDate }) {
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState<{ entry: PlanEntryDto | null; date: LocalDate } | null>(
    null,
  );
  const [opened, setOpened] = useState<{ id: string; name: string } | null>(null);
  const week = weekOf(anchor);
  const grid = monthGrid(month);

  const weekQuery = useQuery({
    queryKey: [...target.key, "calendar", week.from, week.to],
    queryFn: () => target.calendar(week.from, week.to),
  });
  const monthQuery = useQuery({
    queryKey: [...target.key, "calendar", grid.from, grid.to],
    queryFn: () => target.calendar(grid.from, grid.to),
  });
  const statsQuery = useQuery({
    queryKey: [...target.key, "activity", opened?.id],
    queryFn: () => target.activity(opened?.id ?? ""),
    enabled: opened !== null,
  });

  const goTo = (date: LocalDate) => {
    setAnchor(date);
    setMonth(monthOf(date));
  };
  const run = async <R,>(p: Promise<R>) => {
    const r = await p;
    await queryClient.invalidateQueries({ queryKey: target.key });
    return r;
  };

  return (
    <div className="planner-grid">
      <div className="stack">
        <div className="row-between">
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.previousWeek")}
            onClick={() => goTo(addDays(week.from, -7))}
          >
            <Icon name="chevronLeft" />
          </button>
          <div className="stack" style={{ gap: 0, alignItems: "center" }}>
            <h2>{t("common.weekOf", { date: f.date(week.from, "dayMonth") })}</h2>
            {week.from !== weekOf(today).from && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => goTo(today)}>
                {t("common.today")}
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.nextWeek")}
            onClick={() => goTo(addDays(week.from, 7))}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
        <QueryView query={weekQuery}>
          {(calendar) => (
            <section className="card">
              <PlanCompare
                calendar={calendar}
                days={week.days}
                today={today}
                onEdit={(entry) => setEditing({ entry, date: entry.calendarDate })}
                onAdd={(date) => setEditing({ entry: null, date })}
                onOpenActivity={(a) => setOpened({ id: a.id, name: a.activityName })}
                addButton={
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      setEditing({ entry: null, date: anchor < today ? today : anchor })
                    }
                  >
                    <Icon name="plus" size={18} /> {t("plan.add")}
                  </button>
                }
              />
            </section>
          )}
        </QueryView>
      </div>

      <aside className="stack planner-aside">
        <MonthCalendar
          month={month}
          calendar={monthQuery.data}
          today={today}
          selectedWeek={week.from}
          onPickDay={goTo}
          onMonth={setMonth}
        />
        {weekQuery.data && <WeekStats calendar={weekQuery.data} from={week.from} to={week.to} />}
      </aside>

      <PlanEditor
        open={editing !== null}
        entry={editing?.entry ?? null}
        date={editing?.date ?? today}
        canEditNotes={target.canEditNotes}
        onClose={() => setEditing(null)}
        onCreate={(input) => run(target.create(input))}
        onUpdate={(id, patch) => run(target.update(id, patch))}
        onDelete={(id) => run(target.remove(id))}
        onConflict={async () => {
          const fresh = (await weekQuery.refetch()).data?.entries.find(
            (e) => e.id === editing?.entry?.id,
          );
          if (fresh) setEditing({ entry: fresh, date: fresh.calendarDate });
        }}
      />
      <Dialog
        open={opened !== null}
        wide
        title={opened?.name ?? t("stats.title")}
        onClose={() => setOpened(null)}
      >
        <QueryView query={statsQuery}>{(detail) => <ActivityStats detail={detail} />}</QueryView>
      </Dialog>
    </div>
  );
}

export function CoachPlanner() {
  const api = useApi();
  const me = useMe();
  const { t } = useI18n();
  const query = useCoachAthletes();
  const [selected, setSelected] = useState<string | null>(null);
  const active = query.data?.filter((r) => r.status === "active") ?? [];
  const athleteId = selected ?? active[0]?.athleteId ?? null;
  const target = useMemo(
    () => (athleteId ? athleteTarget(api, athleteId) : null),
    [api, athleteId],
  );
  return (
    <div className="stack-l">
      <div className="row-between wrap">
        <h1>{t("nav.planner")}</h1>
        {active.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: 280 }}
            aria-label={t("coachApp.pickAthlete")}
            value={athleteId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {active.map((r) => (
              <option key={r.athleteId} value={r.athleteId}>
                {r.displayName}
              </option>
            ))}
          </select>
        )}
      </div>
      <QueryView query={query}>
        {() =>
          target ? (
            <AthletePlanner key={athleteId} target={target} today={todayIn(me.settings.timeZone)} />
          ) : (
            <section className="card">
              <Empty>{t("coachApp.empty")}</Empty>
            </section>
          )
        }
      </QueryView>
    </div>
  );
}
