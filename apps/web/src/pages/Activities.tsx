import type { ActivityDto } from "@activen/contracts";
import { addDays, type ActivityGroup } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { relativeDay, todayIn } from "../lib/dates.js";
import { groupOf } from "../lib/plan.js";
import { activitySummary } from "../training/labels.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { Empty, QueryView } from "../ui/States.js";

const FILTERS: (ActivityGroup | "all")[] = [
  "all",
  "running",
  "cycling",
  "gym",
  "swimming",
  "walking",
];
const PAGE_DAYS = 56;

export function ActivitiesPage() {
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const today = todayIn(me.settings.timeZone);
  const [days, setDays] = useState(PAGE_DAYS);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const from = addDays(today, -days + 1);
  const query = useQuery({
    queryKey: ["me", "activities", from, today],
    queryFn: () => api.activities(from, today),
    placeholderData: (prev) => prev,
  });

  const dayLabel = (a: ActivityDto) => {
    const rel = relativeDay(a.calendarDate, today);
    return rel ? t(`common.${rel}`) : f.date(a.calendarDate, "long");
  };

  return (
    <div className="stack-l">
      <h1>{t("nav.activities")}</h1>
      <div className="chips" role="group" aria-label={t("plan.field.activityType")}>
        {FILTERS.map((g) => (
          <button
            key={g}
            type="button"
            className="chip chip-button"
            aria-pressed={filter === g}
            onClick={() => setFilter(g)}
          >
            {g === "all" ? t("activities.filter.all") : t(`activityGroup.${g}` as MessageKey)}
          </button>
        ))}
      </div>
      <QueryView query={query}>
        {(list) => {
          const shown = list.filter((a) => filter === "all" || groupOf(a.activityType) === filter);
          return (
            <section className="card">
              {shown.length === 0 ? (
                <Empty>{t("activities.empty")}</Empty>
              ) : (
                <div className="list">
                  {shown.map((a) => (
                    <Link key={a.id} to={`/activities/${a.id}`} className="list-item">
                      <SportIcon group={groupOf(a.activityType)} />
                      <div className="grow">
                        <div className="row-between">
                          <h3>{a.activityName ?? ""}</h3>
                          {a.feedback?.perceivedEffort ? (
                            <span className="chip">RPE {a.feedback.perceivedEffort}</span>
                          ) : (
                            <span className="chip warn">{t("activities.noCheckIn")}</span>
                          )}
                        </div>
                        <div className="small muted">
                          {dayLabel(a)} · {activitySummary(f, a)}
                        </div>
                      </div>
                      <Icon name="chevronRight" size={18} />
                    </Link>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setDays((d) => d + PAGE_DAYS)}
              >
                {t("activities.loadMore")}
              </button>
            </section>
          );
        }}
      </QueryView>
    </div>
  );
}
