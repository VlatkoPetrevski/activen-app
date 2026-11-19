import type { ActivityInsight } from "@activen/contracts";
import { useI18n, type T } from "../i18n/I18nContext.js";

export function insightText(t: T, i: ActivityInsight): string {
  switch (i.code) {
    case "plan_over":
    case "plan_under":
      return t(`insights.${i.code}`, { percent: i.percent });
    case "pace_faster":
    case "pace_slower":
      return t(`insights.${i.code}`, { seconds: i.secondsPerKm });
    case "lower_hr":
    case "higher_hr":
      return t(`insights.${i.code}`, { bpm: i.bpm });
    case "hilly":
      return t("insights.hilly", { meters: i.meters });
    default:
      return t(`insights.${i.code}`);
  }
}

/** Automatic narrative about the session (plan and the last 4 weeks), shown as a short paragraph. */
export function Insights({ insights }: { insights: ActivityInsight[] }) {
  const { t } = useI18n();
  return (
    <section className="insights" aria-label={t("insights.title")}>
      <span className="insights-mark" aria-hidden>
        ✦
      </span>
      <p className="small">
        {insights.length ? (
          insights.map((i) => insightText(t, i)).join(" ")
        ) : (
          <span className="muted">{t("insights.none")}</span>
        )}
      </p>
    </section>
  );
}
