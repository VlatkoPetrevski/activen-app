import type { CalendarDto } from "@activen/contracts";
import { addDays, weekStart, type LocalDate } from "@activen/domain";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";

/** First day of the month of a date. */
export function monthOf(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01` as LocalDate;
}

/** Same day-1 of the month `delta` months away. */
export function shiftMonth(month: LocalDate, delta: number): LocalDate {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10) as LocalDate;
}

/** Whole weeks (Monday first) covering the month: what the calendar grid shows. */
export function monthGrid(month: LocalDate): {
  from: LocalDate;
  to: LocalDate;
  weeks: LocalDate[][];
} {
  const from = weekStart(month);
  const last = addDays(shiftMonth(month, 1), -1);
  const to = addDays(weekStart(last), 6);
  const weeks: LocalDate[][] = [];
  for (let d = from; d <= to; d = addDays(d, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return { from, to, weeks };
}

type DayState = "active" | "missed" | "planned" | null;

/** What a day shows: training done beats a plan; a past plan without training is missed. */
export function dayState(
  calendar: CalendarDto | undefined,
  date: LocalDate,
  today: LocalDate,
): DayState {
  if (!calendar) return null;
  if (calendar.activities.some((a) => a.calendarDate === date)) return "active";
  const workout = calendar.entries.some((e) => e.calendarDate === date && e.kind === "workout");
  if (!workout) return null;
  return date < today && calendar.activitiesVisible ? "missed" : "planned";
}

/**
 * Month at a glance (Strava-like): filled days were active, rings are planned sessions,
 * red rings were missed. The selected week is highlighted; a click on a day opens its week.
 */
export function MonthCalendar({
  month,
  calendar,
  today,
  selectedWeek,
  onPickDay,
  onMonth,
}: {
  month: LocalDate;
  calendar: CalendarDto | undefined;
  today: LocalDate;
  selectedWeek: LocalDate;
  onPickDay(date: LocalDate): void;
  onMonth(month: LocalDate): void;
}) {
  const { t, f } = useI18n();
  const grid = monthGrid(month);
  const inMonth = month.slice(0, 7);
  return (
    <section className="card month-cal" aria-label={t("planner.month")}>
      <div className="row-between">
        <button
          type="button"
          className="icon-btn"
          aria-label={`${t("common.previousMonth")}: ${f.date(shiftMonth(month, -1), "monthYear")}`}
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          <Icon name="chevronLeft" />
        </button>
        <h3 className="month-title">{f.date(month, "monthYear")}</h3>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${t("common.nextMonth")}: ${f.date(shiftMonth(month, 1), "monthYear")}`}
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="month-grid" role="grid">
        <div className="month-row head" role="row">
          {(grid.weeks[0] ?? []).map((d) => (
            <span key={d} role="columnheader" className="tiny muted">
              {f.date(d, "weekdayShort").replace(".", "")}
            </span>
          ))}
        </div>
        {grid.weeks.map((week) => (
          <div
            key={week[0]}
            role="row"
            className={`month-row${week[0] === selectedWeek ? " selected" : ""}`}
          >
            {week.map((d) => {
              const state = dayState(calendar, d, today);
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  className={[
                    "month-day",
                    state ?? "",
                    d.slice(0, 7) !== inMonth ? "out" : "",
                    d === today ? "today" : "",
                  ].join(" ")}
                  aria-label={`${f.date(d, "long")}${state ? ` · ${t(`planner.legend.${state}`)}` : ""}`}
                  onClick={() => onPickDay(d)}
                >
                  <span>{Number(d.slice(8))}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="month-legend tiny muted">
        <span>
          <i className="month-swatch active" /> {t("planner.legend.active")}
        </span>
        <span>
          <i className="month-swatch planned" /> {t("planner.legend.planned")}
        </span>
        <span>
          <i className="month-swatch missed" /> {t("planner.legend.missed")}
        </span>
      </div>
    </section>
  );
}
