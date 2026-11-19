import { useMemo, useState } from "react";
import { useApi } from "../../api/ApiContext.js";
import { useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { todayIn } from "../../lib/dates.js";
import { PlanWeek } from "../../training/PlanWeek.js";
import { athleteTarget } from "../../training/target.js";
import { Empty, QueryView } from "../../ui/States.js";
import { useCoachAthletes } from "./hooks.js";

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
            <div style={{ maxWidth: 760 }}>
              <PlanWeek key={athleteId} target={target} today={todayIn(me.settings.timeZone)} />
            </div>
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
