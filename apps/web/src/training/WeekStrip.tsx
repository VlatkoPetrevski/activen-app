import type { LocalDate } from "@activen/domain";
import { useI18n } from "../i18n/I18nContext.js";
import { dayMark, type DayView } from "../lib/plan.js";
import { Icon } from "../ui/Icon.js";

export function WeekStrip({ days, today }: { days: DayView[]; today: LocalDate }) {
  const { f, t } = useI18n();
  return (
    <div className="week-strip" role="list">
      {days.map((day) => {
        const mark = dayMark(day);
        const statusLabel =
          mark === "done"
            ? t("plan.status.done")
            : mark === "missed"
              ? t("plan.status.missed")
              : mark === "planned"
                ? t("plan.status.planned")
                : mark === "rest"
                  ? t("plan.status.rest")
                  : mark === "extra"
                    ? t("plan.status.unplanned")
                    : "";
        return (
          <div
            key={day.date}
            role="listitem"
            className={`day-cell${day.date === today ? " today" : ""}`}
            aria-label={`${f.date(day.date, "long")}${statusLabel ? ` — ${statusLabel}` : ""}`}
          >
            <span>{f.date(day.date, "weekdayShort")}</span>
            <span className={`day-mark ${mark}`}>
              {mark === "done" || mark === "extra" ? <Icon name="check" size={14} /> : null}
              {mark === "missed" ? <Icon name="close" size={14} /> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
