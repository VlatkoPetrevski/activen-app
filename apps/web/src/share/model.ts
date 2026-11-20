/**
 * Share card model: which numbers an activity can show, sensible defaults per sport, which
 * templates fit, and the route geometry (with a privacy trim around start and finish).
 * Pure functions — the canvas renderer only draws what this module decides.
 */
import type { ActivityDetailDto } from "@activen/contracts";
import { activityGroup, type ActivityType } from "@activen/domain";
import type { Formatter } from "@activen/i18n";
import type { T } from "../i18n/I18nContext.js";
import { meters } from "../lib/geo.js";
import { readsPace } from "../training/labels.js";

export type StatKey =
  | "distance"
  | "time"
  | "pace"
  | "speed"
  | "elevation"
  | "avgHr"
  | "maxHr"
  | "load"
  | "calories"
  | "exercises"
  | "sets"
  | "intervals";

export type Template = "photo" | "route" | "figure" | "intervals" | "bold";
export type CardFormat = "story" | "portrait" | "square";
export type Theme = "ember" | "night" | "light";
export type Figure = "runner" | "cyclist" | "lifter" | "swimmer" | "walker";

export const FORMATS: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
};

/** At most this many numbers on a card: more stops being readable at a glance. */
export const MAX_STATS = 4;

export interface StatItem {
  key: StatKey;
  label: string;
  value: string;
}

function group(type: string) {
  return activityGroup(type as ActivityType);
}

export function figureFor(type: string): Figure {
  switch (group(type)) {
    case "cycling":
      return "cyclist";
    case "gym":
      return "lifter";
    case "swimming":
      return "swimmer";
    case "walking":
      return "walker";
    default:
      return "runner";
  }
}

export function isStructured(d: ActivityDetailDto): boolean {
  return d.laps.some((l) => l.intensity !== "active");
}

/** Every number this activity has, in display order. */
export function availableStats(d: ActivityDetailDto, f: Formatter, t: T): StatItem[] {
  const a = d.activity;
  const pace = readsPace(a.activityType);
  const out: StatItem[] = [];
  const add = (key: StatKey, label: string, value: string | null) => {
    if (value) out.push({ key, label, value });
  };
  const dist = a.distanceInMeters ?? 0;
  add("distance", t("stats.distance"), dist > 0 ? f.distance(dist, 2) : null);
  add("time", t("stats.time"), f.duration(a.durationInSeconds));
  if (dist > 0 && a.durationInSeconds > 0) {
    if (pace) add("pace", t("stats.pace"), f.pace((a.durationInSeconds / dist) * 1000));
    else add("speed", t("stats.speed"), f.speed(dist / a.durationInSeconds));
  }
  add(
    "elevation",
    t("stats.elevation"),
    a.totalElevationGainInMeters ? f.elevation(a.totalElevationGainInMeters) : null,
  );
  add(
    "avgHr",
    t("activity.avgHr"),
    a.averageHeartRateInBeatsPerMinute ? f.heartRate(a.averageHeartRateInBeatsPerMinute) : null,
  );
  add(
    "maxHr",
    t("activity.maxHr"),
    a.maxHeartRateInBeatsPerMinute ? f.heartRate(a.maxHeartRateInBeatsPerMinute) : null,
  );
  add("load", t("stats.load"), a.trainingLoad ? f.number(a.trainingLoad, 0) : null);
  add(
    "calories",
    t("activity.calories"),
    a.activeKilocalories ? `${f.number(a.activeKilocalories, 0)} kcal` : null,
  );
  if (d.exercises.length) {
    add("exercises", t("exercises.title"), String(d.exercises.length));
    add("sets", t("share.sets"), String(d.exercises.reduce((s, e) => s + e.sets.length, 0)));
  }
  const reps = d.laps.filter((l) => l.intensity === "active");
  if (isStructured(d) && reps.length) add("intervals", t("stats.intervals"), String(reps.length));
  return out;
}

/** What a runner, a cyclist or a lifter would post first. */
export function defaultStats(d: ActivityDetailDto): StatKey[] {
  const g = group(d.activity.activityType);
  const order: StatKey[] =
    g === "gym"
      ? ["time", "exercises", "sets", "avgHr"]
      : g === "cycling"
        ? ["distance", "speed", "elevation", "time"]
        : isStructured(d)
          ? ["distance", "pace", "intervals", "time"]
          : ["distance", "pace", "time", "elevation"];
  return order.slice(0, MAX_STATS);
}

/** Templates that make sense for this activity (the route needs GPS, intervals need structure). */
export function availableTemplates(d: ActivityDetailDto): Template[] {
  const out: Template[] = ["photo"];
  if (d.route && d.route.points.length > 1) out.push("route");
  out.push("figure");
  if (isStructured(d)) out.push("intervals");
  out.push("bold");
  return out;
}

export function defaultTemplate(d: ActivityDetailDto): Template {
  return d.route && d.route.points.length > 1 ? "route" : "figure";
}

/** Toggles a stat, keeping the order of `all` and at most {@link MAX_STATS}. */
export function toggleStat(selected: StatKey[], key: StatKey, all: StatKey[]): StatKey[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  if (selected.length >= MAX_STATS) return selected;
  return all.filter((k) => k === key || selected.includes(k));
}

type LatLon = [number, number];

/**
 * Privacy: removes the first and last `trim` metres so a shared route does not show where the
 * athlete lives (like Strava's privacy zones). Short routes keep at least their middle third.
 */
export function trimRoute(points: LatLon[], trim = 200): LatLon[] {
  if (points.length < 3 || trim <= 0) return points;
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += meters(points[i - 1] as LatLon, points[i] as LatLon);
  const cut = Math.min(trim, total / 3);
  let walked = 0;
  let first = 0;
  while (first < points.length - 1 && walked < cut) {
    walked += meters(points[first] as LatLon, points[first + 1] as LatLon);
    first++;
  }
  walked = 0;
  let last = points.length - 1;
  while (last > first && walked < cut) {
    walked += meters(points[last] as LatLon, points[last - 1] as LatLon);
    last--;
  }
  return points.slice(first, last + 1);
}

/** Route projected into a box (equirectangular at the route's latitude), aspect preserved. */
export function fitRoute(
  points: LatLon[],
  box: { x: number; y: number; width: number; height: number },
): [number, number][] {
  if (points.length === 0) return [];
  const lat0 = (points.reduce((s, p) => s + p[0], 0) / points.length) * (Math.PI / 180);
  const xy = points.map(([lat, lon]) => [lon * Math.cos(lat0), -lat] as const);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1e-9;
  const h = Math.max(...ys) - minY || 1e-9;
  const k = Math.min(box.width / w, box.height / h);
  const ox = box.x + (box.width - w * k) / 2;
  const oy = box.y + (box.height - h * k) / 2;
  return xy.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k]);
}

/** File name for the downloaded image: "activen-2026-11-17-skopje-trcanje.png". */
export function shareFileName(d: ActivityDetailDto): string {
  const slug = d.activity.activityName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `activen-${d.activity.calendarDate}${slug ? `-${slug}` : ""}.png`;
}
