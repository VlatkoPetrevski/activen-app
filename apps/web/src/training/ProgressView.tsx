import type { ProgressDto } from "@activen/contracts";
import type { Kpis } from "@activen/domain";
import { Segment } from "../ui/Segment.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Empty } from "../ui/States.js";
import { sportLabel } from "./labels.js";

const MIX_COLORS = ["var(--primary)", "var(--teal)", "#7A4FB0", "var(--accent)", "var(--muted)"];

function Bars({
  values,
  labels,
  format,
  current,
}: {
  values: number[];
  labels: string[];
  format(v: number): string;
  current: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <div
      className="bars"
      role="img"
      aria-label={values.map((v, i) => `${labels[i]}: ${format(v)}`).join(", ")}
    >
      {values.map((v, i) => (
        <div
          key={i}
          className={`bar${i === current ? " current" : ""}`}
          title={`${labels[i]}: ${format(v)}`}
        >
          <span className="tiny muted num bar-value">{v > 0 ? format(v) : ""}</span>
          <span className="fill" style={{ height: `${(v / max) * 78}%` }} />
          <span className="lbl">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Trend({
  now,
  before,
  lowerIsBetter,
}: {
  now: number | null;
  before: number | null;
  lowerIsBetter?: boolean;
}) {
  if (now === null || before === null || before === 0) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.01) return null;
  const good = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span className={`tiny ${good ? "trend-up" : "trend-down"}`}>
      {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}

/** Weekly volume and load charts, 4-week KPIs with trend, activity mix. */
export function ProgressView({ data }: { data: ProgressDto }) {
  const { t, f } = useI18n();
  // Compact week labels "16.11"; every other one on long series.
  const labels = data.weeks.map((w, i) =>
    data.weeks.length > 8 && (data.weeks.length - 1 - i) % 2
      ? ""
      : `${Number(w.from.slice(8))}.${Number(w.from.slice(5, 7))}`,
  );
  const k: Kpis = data.last4Weeks;
  const p: Kpis = data.previous4Weeks;
  if (data.weeks.every((w) => w.activityCount === 0)) return <Empty>{t("progress.empty")}</Empty>;
  const totalMix = data.mix.reduce((s, m) => s + m.count, 0) || 1;
  const thisWeek = data.weeks.at(-1);
  return (
    <div className="stack-l">
      <section className="card">
        <div className="card-title">
          <h2>{t("progress.last4")}</h2>
          <span className="tiny muted">{t("progress.vsPrevious")}</span>
        </div>
        <div className="metrics">
          <div className="metric">
            <span className="value">{k.count}</span>
            <span className="label">{t("progress.kpi.count")}</span>
            <Trend now={k.count} before={p.count} />
          </div>
          <div className="metric">
            <span className="value">{f.distance(k.distanceInMeters, 0)}</span>
            <span className="label">{t("progress.kpi.distance")}</span>
            <Trend now={k.distanceInMeters} before={p.distanceInMeters} />
          </div>
          <div className="metric">
            <span className="value">{f.duration(k.durationInSeconds)}</span>
            <span className="label">{t("progress.kpi.time")}</span>
          </div>
          <div className="metric">
            <span className="value">{f.pace(k.paceInSecondsPerKilometer) || "—"}</span>
            <span className="label">{t("progress.kpi.pace")}</span>
            <Trend
              now={k.paceInSecondsPerKilometer}
              before={p.paceInSecondsPerKilometer}
              lowerIsBetter
            />
          </div>
          <div className="metric">
            <span className="value">
              {k.averageHeartRateInBeatsPerMinute
                ? f.heartRate(Math.round(k.averageHeartRateInBeatsPerMinute))
                : "—"}
            </span>
            <span className="label">{t("progress.kpi.hr")}</span>
          </div>
          <div className="metric">
            <span className="value">
              {k.longestDistanceInMeters ? f.distance(k.longestDistanceInMeters, 1) : "—"}
            </span>
            <span className="label">{t("progress.kpi.longest")}</span>
          </div>
        </div>
      </section>
      <div className="segments">
        <Segment
          label={`${t("progress.weeklyDistance")} (${f.distanceUnit})`}
          summary={
            <span className="seg-line">
              <strong>
                {t("progress.weeklyDistance")} ({f.distanceUnit})
              </strong>
              <span className="small muted num">
                {f.distance(thisWeek?.distanceInMeters ?? 0, 1)}
              </span>
            </span>
          }
        >
          <Bars
            values={data.weeks.map((w) => f.distanceValue(w.distanceInMeters))}
            labels={labels}
            format={(v) => f.number(v, 0)}
            current={data.weeks.length - 1}
          />
        </Segment>
        <Segment
          label={t("progress.weeklyLoad")}
          summary={
            <span className="seg-line">
              <strong>{t("progress.weeklyLoad")}</strong>
              <span className="small muted num">
                {f.number(thisWeek?.totalTrainingLoad ?? 0, 0)}
              </span>
            </span>
          }
        >
          <Bars
            values={data.weeks.map((w) => w.totalTrainingLoad)}
            labels={labels}
            format={(v) => f.number(v, 0)}
            current={data.weeks.length - 1}
          />
        </Segment>
        {data.mix.length > 0 && (
          <Segment
            label={t("progress.mix")}
            summary={
              <span className="seg-line">
                <strong>{t("progress.mix")}</strong>
                <span className="mix-bar mini" aria-hidden>
                  {data.mix.map((m, i) => (
                    <span
                      key={m.activityType}
                      style={{ flexGrow: m.count, background: MIX_COLORS[i % MIX_COLORS.length] }}
                    />
                  ))}
                </span>
              </span>
            }
          >
            <div className="list">
              {data.mix.map((m, i) => (
                <div key={m.activityType} className="list-item">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: MIX_COLORS[i % MIX_COLORS.length],
                    }}
                  />
                  <span className="grow">{sportLabel(t, m.activityType)}</span>
                  <span className="small muted num">
                    {m.count} · {f.percent((m.count / totalMix) * 100)}
                  </span>
                </div>
              ))}
            </div>
          </Segment>
        )}
      </div>
    </div>
  );
}
