import {
  lapBreakdown,
  type ActivityDetailDto,
  type ActivityLapDto,
  type ExerciseDto,
  type LapIntensity,
} from "@activen/contracts";
import { activityGroup, type ActivityType } from "@activen/domain";
import type { Formatter } from "@activen/i18n";
import { useI18n, type T } from "../i18n/I18nContext.js";
import { vendorName } from "../lib/vendors.js";
import { groupOf } from "../lib/plan.js";
import { SportIcon } from "../ui/Icon.js";
import { Segment } from "../ui/Segment.js";

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

/** The fastest full lap (ignores a short last lap). */
function fastest(laps: ActivityLapDto[]): ActivityLapDto | undefined {
  const full = laps.filter(
    (l) => (l.distanceInMeters ?? 0) >= 0.9 * (laps[0]?.distanceInMeters ?? 0),
  );
  return full.reduce<ActivityLapDto | undefined>(
    (best, l) =>
      !best ||
      l.durationInSeconds / (l.distanceInMeters || 1) <
        best.durationInSeconds / (best.distanceInMeters || 1)
        ? l
        : best,
    undefined,
  );
}

/** Garmin exercise code to a readable name: known codes are translated, others humanized. */
function exerciseName(t: T, e: ExerciseDto): string {
  for (const code of [e.name, e.category]) {
    if (!code) continue;
    const key = `exercise.${code}`;
    const text = t(key as never);
    if (text !== key) return text;
  }
  const raw = (e.name ?? e.category).toLowerCase().replaceAll("_", " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Strength session: one line per exercise — "Чучањ со тег · 3 × 10 · 20 kg". */
function ExerciseList({ exercises }: { exercises: ExerciseDto[] }) {
  const { t, f } = useI18n();
  const totalSets = exercises.reduce((s, e) => s + e.sets.length, 0);
  return (
    <Segment
      defaultOpen
      label={t("exercises.title")}
      summary={
        <span className="seg-line">
          <strong>{t("exercises.title")}</strong>
          <span className="small muted num">
            {exercises.length} · {totalSets} ×
          </span>
        </span>
      }
    >
      <ol className="exercise-list">
        {exercises.map((e, i) => {
          const first = e.sets[0];
          const same = e.sets.every(
            (x) =>
              x.reps === first?.reps &&
              x.weightInKilograms === first?.weightInKilograms &&
              x.durationInSeconds === first?.durationInSeconds,
          );
          const sets = same
            ? first?.durationInSeconds
              ? t("exercises.hold", { sets: e.sets.length, seconds: first.durationInSeconds })
              : t("exercises.sets", { sets: e.sets.length, reps: first?.reps ?? "—" })
            : e.sets
                .map((x) => (x.durationInSeconds ? `${x.durationInSeconds}s` : `${x.reps ?? "—"}`))
                .join(" / ");
          const weights = [...new Set(e.sets.map((x) => x.weightInKilograms).filter((w) => w))];
          return (
            <li key={`${e.category}-${i}`}>
              <span className="grow">{exerciseName(t, e)}</span>
              <span className="num small">
                {sets}
                {weights.length
                  ? ` · ${weights.map((w) => f.weight((w ?? 0) * 1000)).join(" / ")}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </Segment>
  );
}

/** Activity stats for the planner: key numbers, source and sensors, intervals and laps. */
export function ActivityStats({
  detail,
  hideHeader = false,
}: {
  detail: ActivityDetailDto;
  /** The page already shows the activity's name and date. */
  hideHeader?: boolean;
}) {
  const { t, f } = useI18n();
  const { activity: a, laps, device, exercises } = detail;
  const pace = usesPace(a.activityType);
  const structured = laps.some((l) => l.intensity !== "active");
  const groups = lapBreakdown(laps);
  const sensor = device.heartRateSensor ?? "unknown";
  // Only what the session has: a strength session shows no distance, pace or elevation.
  const tiles = (
    [
      [t("stats.distance"), a.distanceInMeters ? f.distance(a.distanceInMeters, 2) : null],
      [t("stats.time"), f.duration(a.durationInSeconds)],
      [
        t(pace ? "stats.pace" : "stats.speed"),
        a.distanceInMeters ? rate(f, pace, a.distanceInMeters, a.durationInSeconds) : null,
      ],
      [
        t("stats.hr"),
        a.averageHeartRateInBeatsPerMinute === null && a.maxHeartRateInBeatsPerMinute === null
          ? null
          : hrPair(a.averageHeartRateInBeatsPerMinute, a.maxHeartRateInBeatsPerMinute),
      ],
      [
        t("stats.elevation"),
        a.totalElevationGainInMeters ? f.elevation(a.totalElevationGainInMeters) : null,
      ],
      [t("stats.load"), a.trainingLoad === null ? null : String(a.trainingLoad)],
    ] as const
  ).filter((x): x is readonly [string, string] => x[1] !== null);
  const reps = groups.find((g) => g.intensity === "active");
  const best = fastest(laps);
  const lapsSummary =
    laps.length === 0
      ? ""
      : structured && reps
        ? `${reps.count} × ${t("lap.active")} · ${rate(f, pace, reps.distanceInMeters, reps.durationInSeconds)} · ♥ ${hrPair(reps.averageHeartRateInBeatsPerMinute, reps.maxHeartRateInBeatsPerMinute)}`
        : `${laps.length} × ${t("lap.auto")} · ${rate(f, pace, best?.distanceInMeters ?? null, best?.durationInSeconds ?? 0)}`;

  return (
    <div className="stack activity-stats">
      {!hideHeader && (
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
      )}

      <div className="stat-grid">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <span className="value">{value}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>

      <div className="segments">
        {exercises.length > 0 && <ExerciseList exercises={exercises} />}
        <Segment
          label={t("stats.sourceTitle")}
          summary={
            <span className="seg-line">
              <strong>{t("stats.sourceTitle")}</strong>
              <span className="small muted">
                {[vendorName(device.vendor), device.deviceName, t(`stats.sensor.${sensor}`)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          }
        >
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
        </Segment>
        {(laps.length > 0 || !exercises.length) && (
          <Segment
            defaultOpen={structured}
            label={t(structured ? "stats.intervals" : "stats.laps")}
            summary={
              <span className="seg-line">
                <strong>{t(structured ? "stats.intervals" : "stats.laps")}</strong>
                <span className="small muted num">{lapsSummary}</span>
              </span>
            }
          >
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
                          ♥{" "}
                          {hrPair(
                            g.averageHeartRateInBeatsPerMinute,
                            g.maxHeartRateInBeatsPerMinute,
                          )}
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
                        <tr
                          key={l.index}
                          className={structured ? `lap-row-${l.intensity}` : undefined}
                        >
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
                            {hrPair(
                              l.averageHeartRateInBeatsPerMinute,
                              l.maxHeartRateInBeatsPerMinute,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Segment>
        )}
      </div>
    </div>
  );
}
