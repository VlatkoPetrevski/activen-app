import type { BriefingDto } from "@activen/contracts";
import type { FactorStatus, ReadinessFactor, ReadinessFactorKey, Vendor } from "@activen/domain";
import { sleepDurationText, sleepQualityKey } from "@activen/i18n";
import { useI18n } from "../i18n/I18nContext.js";
import { vendorName } from "../lib/vendors.js";
import { Icon, type IconName } from "../ui/Icon.js";
import { Ring } from "../ui/Ring.js";
import { Segment } from "../ui/Segment.js";

const STATUS_COLOR: Record<FactorStatus, string> = {
  good: "var(--good)",
  fair: "var(--warn)",
  poor: "var(--bad)",
  missing: "var(--border)",
};

const FACTOR_ICON: Record<ReadinessFactorKey, IconName> = {
  sleep: "sleep",
  hrv: "hrv",
  restingHr: "heart",
  load: "progress",
};

/** Which wellness field each factor reads (for "from Polar" / "entered"). */
const FACTOR_FIELD = {
  sleep: "sleepDurationInSeconds",
  hrv: "lastNightHrvMs",
  restingHr: "restingHeartRate",
  load: null,
} as const;

export const readinessColor = (v: number) =>
  v >= 75 ? "var(--good)" : v >= 50 ? "var(--teal)" : v >= 25 ? "var(--warn)" : "var(--bad)";

const sleepText = (seconds: number | null) => {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

function useFactorText() {
  const { t, f, translator } = useI18n();
  return {
    value(x: ReadinessFactor | undefined): string {
      if (x?.key === "sleep" && x.value === null && x.quality) return t(sleepQualityKey(x.quality));
      if (!x || x.value === null) return "—";
      switch (x.unit) {
        case "seconds":
          return x.typed ? sleepDurationText(translator, f, x.value, true) : sleepText(x.value);
        case "score":
          return t("today.sleepScore", { score: x.value });
        case "ms":
          return `${f.number(x.value, 0)} ms`;
        case "bpm":
          return String(x.value);
        case "ratio":
          return `${f.number(x.value, 1)}×`;
      }
    },
    baseline(x: ReadinessFactor): string | null {
      if (x.baseline === null) return null;
      if (x.key === "sleep") {
        const need = t("briefing.need", { value: sleepText(x.baseline) });
        return x.quality && x.value !== null ? `${t(sleepQualityKey(x.quality))} · ${need}` : need;
      }
      if (x.key === "load") return null;
      return t("briefing.usual", { value: x.baseline });
    },
  };
}

/**
 * Morning readiness in one compact row (score, sleep, HRV, resting pulse, load); the details show
 * each factor against the athlete's own baseline and where the value came from.
 */
export function ReadinessSegment({ briefing }: { briefing: BriefingDto | null }) {
  const { t } = useI18n();
  const text = useFactorText();
  const r = briefing?.readiness;
  if (!briefing || !r || r.score === null || !r.level)
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

  const score = r.score;
  const levelText = t(`trainingReadiness.level.${r.level}`);
  const factor = (key: ReadinessFactorKey) => r.factors.find((x) => x.key === key);
  const sources = briefing.today?.sources ?? {};
  const sourceOf = (key: ReadinessFactorKey): string | null => {
    const field = FACTOR_FIELD[key];
    const s: Vendor | undefined = field ? sources[field] : undefined;
    if (!s) return null;
    return s === "manual"
      ? t("briefing.source.manual")
      : t("briefing.source.vendor", { vendor: vendorName(s) });
  };
  const vendorReadinessSource = sources.vendorReadiness;
  const shortLabel: Record<ReadinessFactorKey, string> = {
    sleep: t("readiness.short.sleep"),
    hrv: t("readiness.short.hrv"),
    restingHr: t("readiness.short.restingHr"),
    load: t("readiness.short.load"),
  };

  return (
    <Segment
      label={`${t("trainingReadiness.title")}: ${score}, ${levelText}`}
      srTitle={t("trainingReadiness.title")}
      summary={
        <span className="stats-row">
          <span className="stat">
            <span className="stat-value num" style={{ color: readinessColor(score) }}>
              {score}
            </span>
            <span className="stat-label">{levelText.toLowerCase()}</span>
          </span>
          {(["sleep", "hrv", "restingHr", "load"] as const).map((key) => {
            const x = factor(key);
            return (
              <span className="stat" key={key}>
                <span className="stat-value num">
                  {x && x.status !== "missing" && (
                    <span className="dot" style={{ background: STATUS_COLOR[x.status] }} />
                  )}
                  {key === "sleep" && x?.unit === "score"
                    ? sleepText(briefing.today?.sleepDurationInSeconds ?? null)
                    : key === "hrv" && x?.value != null
                      ? Math.round(x.value)
                      : text.value(x)}
                </span>
                <span className="stat-label">{shortLabel[key]}</span>
              </span>
            );
          })}
        </span>
      }
    >
      <div className="stack">
        <div className="readiness">
          <Ring value={score} label={`${t("trainingReadiness.title")}: ${score}`} />
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{t("trainingReadiness.title")}</span>
            <h2>{levelText}</h2>
            <p className="muted small">{t(`briefing.confidence.${r.confidence}`)}</p>
            {r.vendorReadiness !== null && vendorReadinessSource && (
              <p className="tiny muted">
                {t("briefing.vendorReadiness", {
                  vendor: vendorName(vendorReadinessSource),
                  score: r.vendorReadiness,
                })}
              </p>
            )}
          </div>
        </div>
        <div className="tiles">
          {r.factors.map((x) => {
            const baseline = text.baseline(x);
            const source = sourceOf(x.key);
            return (
              <div className="tile" key={x.key}>
                <div className="row small muted">
                  <Icon name={FACTOR_ICON[x.key]} size={16} /> {t(`briefing.factor.${x.key}`)}
                </div>
                <div className="value num">
                  <span className="dot" style={{ background: STATUS_COLOR[x.status] }} />
                  {text.value(x)}
                </div>
                {(baseline || source) && (
                  <div className="tiny muted">{[baseline, source].filter(Boolean).join(" · ")}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Segment>
  );
}
