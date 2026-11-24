import { useMemo } from "react";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { todayIn } from "../lib/dates.js";
import { PlanWeek } from "../training/PlanWeek.js";
import { selfTarget } from "../training/target.js";
import { TargetGoalCard } from "../training/TargetGoal.js";

export function PlanPage() {
  const api = useApi();
  const me = useMe();
  const { t } = useI18n();
  const target = useMemo(() => selfTarget(api), [api]);
  return (
    <div className="stack-l">
      <h1>{t("nav.plan")}</h1>
      <TargetGoalCard
        target={target}
        today={todayIn(me.settings.timeZone)}
        onRemove={() => api.removeGoal()}
      />
      <PlanWeek
        target={target}
        today={todayIn(me.settings.timeZone)}
        activityLink={(id) => `/activities/${id}`}
      />
    </div>
  );
}
