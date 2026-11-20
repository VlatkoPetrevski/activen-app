import {
  lapBreakdown,
  type ActivityDetailDto,
  type ActivityLapDto,
  type LapIntensity,
} from "@activen/contracts";
import { activityGroup, type ActivityType } from "@activen/domain";
import type { Formatter } from "@activen/i18n";
import { useI18n, type T } from "../i18n/I18nContext.js";
import { vendorName } from "../lib/vendors.js";
import { groupOf } from "../lib/plan.js";
import { SportIcon } from "../ui/Icon.js";

/** Running and walking are read in pace; everything else in speed. */
function usesPace(type: string): boolean {
  try {
    const g = activityGroup(type as ActivityType);
    return g === "running" || g === "walking";
  } catch {
    return false;
  }
}

/** Pace or speed of a stretch: elapsed time over distance (project rule: elapsed, not moving). */
function rate(f: Formatter, pace: boolean, meters: number | null, seconds: number): string {
  if (!meters || meters <= 0 || seconds <= 0) return "—";
  return pace ? f.pace((seconds / meters) * 1000) : f.speed(meters / seconds);
}

function hrPair(avg: number | null, max: number | null): string {
  if (avg === null && max === null) return "—";
  return `${avg ?? "—"} / ${max ?? "—"}`;
}

function lapLabel(t: T, intensity: LapIntensity, structured: boolean): string {
  if (intensity === "active" && !structured) return t("lap.auto");
  return t(`lap.${intensity}`);
}

/**
 * Laps as a bar chart: width is lap time, height is speed, colour is the intensity.
 * Shows the shape of a workout (warm-up, reps, recoveries, cool-down) at a glance.
 */
function IntervalChart({ laps, structured }: { laps: ActivityLapDto[]; structured: boolean }) {
  const { t } = useI18n();
  const W = 640;
  const H = 120;
  const total = laps.reduce((s, l) => s + l.durationInSeconds, 0) || 1;
  const speeds = laps.map((l) => (l.distanceInMeters ?? 0) / Math.max(1, l.durationInSeconds));
  const top = Math.max(...speeds, 0.1);
  const low = Math.min(...speeds.filter((v) => v > 0), top) * 0.8;
  let x = 0;
  return (
    <figure className="lap-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("stats.chartLabel")}>
        {laps.map((l, i) => {
          const w = (l.durationInSeconds / total) * W;
          const v = speeds[i] ?? 0;
          const h = Math.max(6, ((v - low) / Math.max(0.01, top - low)) * (H - 10) + 6);
          const rect = (
            <rect
              key={l.index}
              x={x + 0.75}
              y={H - h}
              width={Math.max(1, w - 1.5)}
              height={h}
              rx={2}
              className={`lap-bar lap-${l.intensity}${structured ? "" : " auto"}`}
            >
              <title>
                {lapLabel(t, l.intensity, structured)} {l.index}
              </title>
            </rect>
          );
          x += w;
          return rect;
        })}
      </svg>
      {structured && (
        <figcaption className="lap-legend tiny muted">
          {(["warmup", "active", "recovery", "cooldown"] as const)
            .filter((k) => laps.some((l) => l.intensity === k))
            .map((k) => (
              <span key={k}>
                <i className={`lap-swatch lap-${k}`} /> {t(`lap.${k}`)}
              </span>
            ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Activity stats for the planner: key numbers, source and sensors, intervals and laps. */
export function ActivityStats({ detail }: { detail: ActivityDetailDto }) {
  const { t, f } = useI18n();
  const { activity: a, laps, device } = detail;
  const pace = usesPace(a.activityType);
  const structured = laps.some((l) => l.intensity !== "active");
  const groups = lapBreakdown(laps);
  const sensor = device.heartRateSensor ?? "unknown";

  return (
    <div className="stack activity-stats">
      <div className="row">
        <SportIcon group={groupOf(a.activityType)} />
        <div className="grow">
          <div className="small muted">
            {f.date(a.calendarDate, "long")}
            {detail.planEntry
              ? ` · ${t("stats.plan", { plan: detail.planEntry.description })}`
              : ""}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div>
          <span className="value">
            {a.distanceInMeters ? f.distance(a.distanceInMeters, 2) : "—"}
          </span>
          <span className="label">{t("stats.distance")}</span>
        </div>
        <div>
          <span className="value">{f.duration(a.durationInSeconds)}</span>
          <span className="label">{t("stats.time")}</span>
        </div>
        <div>
          <span className="value">{rate(f, pace, a.distanceInMeters, a.durationInSeconds)}</span>
          <span className="label">{t(pace ? "stats.pace" : "stats.speed")}</span>
        </div>
        <div>
          <span className="value">
            {hrPair(a.averageHeartRateInBeatsPerMinute, a.maxHeartRateInBeatsPerMinute)}
          </span>
          <span className="label">{t("stats.hr")}</span>
        </div>
        <div>
          <span className="value">
            {a.totalElevationGainInMeters !== null
              ? f.elevation(a.totalElevationGainInMeters)
              : "—"}
          </span>
          <span className="label">{t("stats.elevation")}</span>
        </div>
        <div>
          <span className="value">{a.trainingLoad ?? "—"}</span>
          <span className="label">{t("stats.load")}</span>
        </div>
      </div>

      <section className="stack-s">
        <h4>{t("stats.sourceTitle")}</h4>
        <dl className="facts">
          <div>
            <dt>{t("stats.source")}</dt>
            <dd>{vendorName(device.vendor)}</dd>
          </div>
          <div>
            <dt>{t("stats.device")}</dt>
            <dd>{device.deviceName ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("stats.hrSensor")}</dt>
            <dd>
              {t(`stats.sensor.${sensor}`)}
              {device.heartRateSensorName ? ` · ${device.heartRateSensorName}` : ""}
            </dd>
          </div>
        </dl>
        {sensor === "optical" && structured && (
          <p className="tiny muted">{t("stats.opticalHint")}</p>
        )}
      </section>

      <section className="stack-s">
        <h4>{t(structured ? "stats.intervals" : "stats.laps")}</h4>
        {laps.length === 0 ? (
          <p className="small muted">{t("stats.noLaps")}</p>
        ) : (
          <>
            <IntervalChart laps={laps} structured={structured} />
            {structured && (
              <div className="lap-groups">
                {groups.map((g) => (
                  <div key={g.intensity} className={`lap-group lap-${g.intensity}`}>
                    <div className="small" style={{ fontWeight: 700 }}>
                      {g.count > 1 ? `${g.count} × ` : ""}
                      {t(`lap.${g.intensity}`)}
                    </div>
                    <div className="tiny muted num">
                      {g.distanceInMeters ? f.distance(g.distanceInMeters, 2) : "—"} ·{" "}
                      {f.duration(g.durationInSeconds)} ·{" "}
                      {rate(f, pace, g.distanceInMeters, g.durationInSeconds)}
                    </div>
                    <div className="tiny muted num">
                      ♥ {hrPair(g.averageHeartRateInBeatsPerMinute, g.maxHeartRateInBeatsPerMinute)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="table-scroll">
              <table className="table lap-table">
                <thead>
                  <tr>
                    <th>{t("stats.col.lap")}</th>
                    <th>{t("stats.col.type")}</th>
                    <th className="num">{t("stats.col.distance")}</th>
                    <th className="num">{t("stats.col.time")}</th>
                    <th className="num">{t(pace ? "stats.col.pace" : "stats.col.speed")}</th>
                    <th className="num">{t("stats.col.hr")}</th>
                  </tr>
                </thead>
                <tbody>
                  {laps.map((l) => (
                    <tr key={l.index} className={structured ? `lap-row-${l.intensity}` : undefined}>
                      <td className="num">{l.index}</td>
                      <td>
                        <i className={`lap-swatch lap-${l.intensity}`} />{" "}
                        {lapLabel(t, l.intensity, structured)}
                      </td>
                      <td className="num">
                        {l.distanceInMeters ? f.distance(l.distanceInMeters, 2) : "—"}
                      </td>
                      <td className="num">{f.duration(l.durationInSeconds)}</td>
                      <td className="num">
                        {rate(f, pace, l.distanceInMeters, l.durationInSeconds)}
                      </td>
                      <td className="num">
                        {hrPair(l.averageHeartRateInBeatsPerMinute, l.maxHeartRateInBeatsPerMinute)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
