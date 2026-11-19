import type { WellnessDto } from "@activen/contracts";
import { trainingReadinessLevel } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";
import { Ring } from "../ui/Ring.js";
import { Segment } from "../ui/Segment.js";

const HRV_COLOR: Record<WellnessDto["hrvStatus"], string> = {
  balanced: "var(--good)",
  unbalanced: "var(--warn)",
  low: "var(--bad)",
  poor: "var(--bad)",
  none: "var(--border)",
};

export const readinessColor = (v: number) =>
  v >= 75 ? "var(--good)" : v >= 50 ? "var(--teal)" : v >= 25 ? "var(--warn)" : "var(--bad)";

const sleepText = (seconds: number | null) => {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** Morning readiness in one compact row (score, HRV, recovery, sleep, resting HR); details on tap. */
export function ReadinessSegment({ wellness }: { wellness: WellnessDto | null }) {
  const { t } = useI18n();
  if (!wellness || wellness.trainingReadiness === null)
    return (
      <section className="segment">
        <div className="segment-head static">
          <span className="row">
            <Icon name="battery" />
            <span className="small muted">{t("today.readiness.noData")}</span>
          </span>
        </div>
      </section>
    );

  const score = wellness.trainingReadiness;
  const level = trainingReadinessLevel(Math.max(1, score));
  const levelText = t(`trainingReadiness.level.${level}`);
  const hrvKey =
    `hrvStatus.${wellness.hrvStatus === "none" ? "NO_STATUS" : wellness.hrvStatus.toUpperCase()}` as MessageKey;
  const recoveryHours =
    wellness.recoveryTimeInMinutes === null
      ? null
      : Math.round(wellness.recoveryTimeInMinutes / 60);

  return (
    <Segment
      label={`${t("trainingReadiness.title")}: ${score}, ${levelText}`}
      summary={
        <span className="stats-row">
          <span className="stat">
            <span className="stat-value num" style={{ color: readinessColor(score) }}>
              {score}
            </span>
            <span className="stat-label">{levelText.toLowerCase()}</span>
          </span>
          <span className="stat">
            <span className="stat-value num">
              <span className="dot" style={{ background: HRV_COLOR[wellness.hrvStatus] }} />
              {wellness.lastNightHrvMs ?? "—"}
            </span>
            <span className="stat-label">{t("readiness.short.hrv")}</span>
          </span>
          <span className="stat">
            <span className="stat-value num">
              {recoveryHours === null ? "—" : t("readiness.hours", { value: recoveryHours })}
            </span>
            <span className="stat-label">{t("readiness.short.recovery")}</span>
          </span>
          <span className="stat">
            <span className="stat-value num">{sleepText(wellness.sleepDurationInSeconds)}</span>
            <span className="stat-label">{t("readiness.short.sleep")}</span>
          </span>
          <span className="stat">
            <span className="stat-value num">{wellness.restingHeartRate ?? "—"}</span>
            <span className="stat-label">{t("readiness.short.restingHr")}</span>
          </span>
        </span>
      }
    >
      <div className="stack">
        <div className="readiness">
          <Ring value={score} label={`${t("trainingReadiness.title")}: ${score}`} />
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{t("trainingReadiness.title")}</span>
            <h2>{levelText}</h2>
            <p className="muted small">{t(`trainingReadiness.message.${level}`)}</p>
          </div>
        </div>
        <div className="tiles">
          <div className="tile">
            <div className="row small muted">
              <Icon name="hrv" size={16} /> {t("today.hrv")}
            </div>
            <div className="value">{wellness.lastNightHrvMs ?? "—"} ms</div>
            <div className="tiny" style={{ color: HRV_COLOR[wellness.hrvStatus] }}>
              {t(hrvKey)}
            </div>
          </div>
          <div className="tile">
            <div className="row small muted">
              <Icon name="battery" size={16} /> {t("today.recovery")}
            </div>
            <div className="value">
              {recoveryHours === null ? "—" : t("readiness.hours", { value: recoveryHours })}
            </div>
          </div>
          <div className="tile">
            <div className="row small muted">
              <Icon name="sleep" size={16} /> {t("today.sleep")}
            </div>
            <div className="value">{sleepText(wellness.sleepDurationInSeconds)}</div>
            {wellness.sleepScore !== null && (
              <div className="tiny muted">
                {t("today.sleepScore", { score: wellness.sleepScore })}
              </div>
            )}
          </div>
          <div className="tile">
            <div className="row small muted">
              <Icon name="heart" size={16} /> {t("today.restingHr")}
            </div>
            <div className="value">{wellness.restingHeartRate ?? "—"}</div>
            <div className="tiny muted">bpm</div>
          </div>
        </div>
      </div>
    </Segment>
  );
}
