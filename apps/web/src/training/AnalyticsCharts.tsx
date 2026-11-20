import type {
  AnalyticsFlag,
  AnalyticsWeek,
  ComplianceDay,
  FitnessPoint,
  LoadRatioLevel,
} from "@activen/contracts";
import { useI18n, type T } from "../i18n/I18nContext.js";

/** Seven dots, oldest first: done, partly done, missed, planned, rest, unplanned. */
export function ComplianceDots({ days }: { days: ComplianceDay[] }) {
  const { t, f } = useI18n();
  return (
    <span className="dots" role="list">
      {days.map((d) => (
        <span
          key={d.date}
          role="listitem"
          className={`dot ${d.state}`}
          title={`${f.date(d.date, "weekdayShort")} · ${t(`analytics.state.${d.state}`)}`}
          aria-label={`${f.date(d.date, "long")}: ${t(`analytics.state.${d.state}`)}`}
        />
      ))}
    </span>
  );
}

/** Small bar chart of weekly distance, current week (to date) highlighted. */
export function Sparkbars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const W = 8 * values.length + 2 * (values.length - 1);
  return (
    <svg className="sparkbars" viewBox={`0 0 ${W} 28`} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 28);
        return (
          <rect
            key={i}
            x={i * 10}
            y={28 - h}
            width={8}
            height={h}
            rx={1.5}
            className={i === values.length - 1 ? "current" : ""}
          />
        );
      })}
    </svg>
  );
}

export function LoadChip({ ratio, level }: { ratio: number; level: LoadRatioLevel }) {
  const { t, f } = useI18n();
  const tone =
    level === "optimal" ? "good" : level === "low" ? "" : level === "elevated" ? "warn" : "bad";
  return (
    <span className={`chip ${tone}`} title={t("analytics.load.hint")}>
      {f.number(ratio, 2)} · {t(`analytics.load.${level}`)}
    </span>
  );
}

export function formLevel(form: number): "fresh" | "neutral" | "training" | "overreached" {
  if (form >= 5) return "fresh";
  if (form >= -10) return "neutral";
  if (form >= -30) return "training";
  return "overreached";
}

export function FormBadge({ form }: { form: number }) {
  const { t, f } = useI18n();
  const level = formLevel(form);
  return (
    <span className={`form-badge ${level}`} title={t("analytics.form.hint")}>
      <strong className="num">{form > 0 ? `+${f.number(form, 0)}` : f.number(form, 0)}</strong>{" "}
      <span className="small">{t(`analytics.form.${level}`)}</span>
    </span>
  );
}

/** Weekly distance for 12 weeks with sessions done/planned over each bar. */
export function WeeklyChart({ weeks }: { weeks: AnalyticsWeek[] }) {
  const { t, f } = useI18n();
  const W = 640;
  const H = 170;
  const top = 22;
  const base = H - 22;
  const max = Math.max(...weeks.map((w) => w.distanceInMeters), 1);
  const bw = W / weeks.length;
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("analytics.weekly.label")}
    >
      {weeks.map((w, i) => {
        const h = (w.distanceInMeters / max) * (base - top);
        const x = i * bw + bw * 0.18;
        const current = i === weeks.length - 1;
        return (
          <g key={w.weekStart}>
            <rect
              x={x}
              y={base - h}
              width={bw * 0.64}
              height={Math.max(1, h)}
              rx={3}
              className={`bar${current ? " current" : ""}`}
            >
              <title>
                {f.date(w.weekStart, "dayMonth")}: {f.distance(w.distanceInMeters, 1)} ·{" "}
                {f.totalTime(w.durationInSeconds)}
              </title>
            </rect>
            {w.distanceInMeters > 0 && (
              <text x={x + bw * 0.32} y={base - h - 5} textAnchor="middle" className="chart-value">
                {f.number(f.distanceValue(w.distanceInMeters), 0)}
              </text>
            )}
            {w.sessionsPlanned > 0 && (
              <text
                x={x + bw * 0.32}
                y={H - 6}
                textAnchor="middle"
                className={`chart-axis${w.sessionsDone < w.sessionsPlanned * 0.7 ? " low" : ""}`}
              >
                {w.sessionsDone}/{w.sessionsPlanned}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={base} y2={base} className="chart-baseline" />
    </svg>
  );
}

/** Fitness and fatigue as lines, form as bars around zero (Performance Management Chart). */
export function FitnessChart({ points }: { points: FitnessPoint[] }) {
  const { t, f } = useI18n();
  if (points.length < 2) return null;
  const W = 640;
  const H = 200;
  const upper = Math.max(...points.map((p) => Math.max(p.fitness, p.fatigue)), 10) * 1.1;
  const lowest = Math.min(...points.map((p) => p.form), -10);
  const highest = Math.max(...points.map((p) => p.form), 10);
  const lineTop = 8;
  const lineBottom = 120;
  const formTop = 136;
  const formBottom = H - 6;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => lineBottom - (v / upper) * (lineBottom - lineTop);
  const zero = formTop + (highest / (highest - lowest)) * (formBottom - formTop);
  const fy = (v: number) => zero - (v / (highest - lowest)) * (formBottom - formTop);
  const line = (k: "fitness" | "fatigue") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const last = points.at(-1);
  return (
    <figure className="fitness-chart">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("analytics.fitness")}
      >
        <path d={line("fatigue")} className="line fatigue" />
        <path d={line("fitness")} className="line fitness" />
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - W / points.length / 2 + 0.5}
            width={Math.max(1, W / points.length - 1)}
            y={Math.min(zero, fy(p.form))}
            height={Math.max(0.5, Math.abs(fy(p.form) - zero))}
            className={`form-bar ${formLevel(p.form)}`}
          />
        ))}
        <line x1={0} x2={W} y1={zero} y2={zero} className="chart-baseline" />
      </svg>
      <figcaption className="chart-legend tiny muted">
        <span>
          <i className="swatch fitness" /> {t("analytics.fitness.fitness")}{" "}
          <strong className="num">{f.number(last?.fitness ?? 0, 0)}</strong>
        </span>
        <span>
          <i className="swatch fatigue" /> {t("analytics.fitness.fatigue")}{" "}
          <strong className="num">{f.number(last?.fatigue ?? 0, 0)}</strong>
        </span>
        <span>
          <i className="swatch form" /> {t("analytics.fitness.form")}{" "}
          <strong className="num">{f.number(last?.form ?? 0, 0)}</strong>
        </span>
      </figcaption>
    </figure>
  );
}

/** One stacked bar of effort shares (easy / moderate / hard / unrated). */
export function EffortBar({
  effort,
}: {
  effort: { easy: number; moderate: number; hard: number; unrated: number };
}) {
  const { t } = useI18n();
  const total = effort.easy + effort.moderate + effort.hard + effort.unrated || 1;
  const keys = ["easy", "moderate", "hard", "unrated"] as const;
  return (
    <div className="stack-s">
      <div className="effort-bar" role="img" aria-label={t("analytics.effortTitle")}>
        {keys.map((k) =>
          effort[k] ? (
            <span key={k} className={`effort-${k}`} style={{ flexGrow: effort[k] }}>
              {Math.round((effort[k] / total) * 100)}%
            </span>
          ) : null,
        )}
      </div>
      <div className="chart-legend tiny muted">
        {keys.map((k) => (
          <span key={k}>
            <i className={`swatch effort-${k}`} /> {t(`analytics.effort.${k}`)} · {effort[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function flagText(
  t: T,
  f: { number(v: number, d?: number): string },
  flag: AnalyticsFlag,
): string {
  switch (flag.code) {
    case "load_high":
    case "load_elevated":
      return t(`analytics.flag.${flag.code}`, { ratio: f.number(flag.ratio, 2) });
    case "long_run_spike":
      return t("analytics.flag.long_run_spike", { percent: flag.percent });
    case "low_compliance":
      return t("analytics.flag.low_compliance", { percent: flag.percent });
    case "hard_efforts":
      return t("analytics.flag.hard_efforts", { count: flag.count });
    case "inactive":
      return t("analytics.flag.inactive", { days: flag.days });
  }
}
