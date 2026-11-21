import type { ImportedStreams } from "./model.js";

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lat, lon] points (haversine). */
export function haversine(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance from GPS points (null where a point is missing). */
export function cumulativeDistance(
  lat: readonly (number | null)[],
  lon: readonly (number | null)[],
): (number | null)[] {
  let total = 0;
  let prev: [number, number] | null = null;
  return lat.map((la, i) => {
    const lo = lon[i];
    if (la == null || lo == null) return prev ? total : null;
    const point: [number, number] = [la, lo];
    if (prev) total += haversine(prev, point);
    prev = point;
    return total;
  });
}

/**
 * Elevation gain with a hysteresis threshold, so GPS/barometer noise does not add up: a climb
 * counts only once the altitude has risen `threshold` metres above the last low point.
 */
export function elevationGain(altitude: readonly (number | null)[], threshold = 3): number | null {
  let gain = 0;
  let base: number | null = null;
  let seen = false;
  for (const a of altitude) {
    if (a == null) continue;
    seen = true;
    if (base == null || a < base) base = a;
    else if (a - base >= threshold) {
      gain += a - base;
      base = a;
    }
  }
  return seen ? Math.round(gain) : null;
}

/**
 * Altitude with impossible values removed: outside -500…9000 m, or a jump of more than 50 m per
 * second from the last good value (barometer resets, GPS glitches, corrupt records).
 */
export function cleanAltitude(
  time: readonly number[],
  altitude: readonly (number | null)[],
): (number | null)[] {
  let lastT: number | null = null;
  let lastA: number | null = null;
  return altitude.map((a, i) => {
    if (a == null || a < -500 || a > 9000) return null;
    const t = time[i] ?? 0;
    if (lastA != null && lastT != null && Math.abs(a - lastA) > 50 * Math.max(1, t - lastT))
      return null;
    lastT = t;
    lastA = a;
    return a;
  });
}

/**
 * Moving time: seconds between samples where the athlete moved (speed above `minSpeed` m/s and
 * no recording gap longer than `maxGap` seconds).
 */
export function movingTime(
  time: readonly number[],
  speed: readonly (number | null)[],
  minSpeed = 0.5,
  maxGap = 10,
): number | null {
  if (time.length < 2) return null;
  let moving = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
    const v = speed[i];
    if (dt > 0 && dt <= maxGap && v != null && v >= minSpeed) moving += dt;
  }
  return moving;
}

/** Speed (m/s) from cumulative distance and time, where the file has no speed channel. */
export function speedFromDistance(
  time: readonly number[],
  distance: readonly (number | null)[],
): (number | null)[] {
  return time.map((t, i) => {
    if (i === 0) return 0;
    const d0 = distance[i - 1];
    const d1 = distance[i];
    const dt = t - (time[i - 1] ?? t);
    if (d0 == null || d1 == null || dt <= 0) return null;
    return (d1 - d0) / dt;
  });
}

const numbers = (values: readonly (number | null)[] | undefined) =>
  (values ?? []).filter((v): v is number => v != null && Number.isFinite(v));

/** Time-weighted average would be more exact; samples are ≤1 Hz, so a plain mean is close. */
export function mean(values: readonly (number | null)[] | undefined): number | null {
  const xs = numbers(values);
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

export function max(values: readonly (number | null)[] | undefined): number | null {
  const xs = numbers(values);
  return xs.length ? Math.max(...xs) : null;
}

/**
 * Keeps at most one sample per second and at most `limit` rows (evenly thinned), so a long
 * activity stays small to store and draw. All channels are thinned together.
 */
export function thinStreams(streams: ImportedStreams, limit = 20_000): ImportedStreams {
  const keep: number[] = [];
  let last = -Infinity;
  streams.time.forEach((t, i) => {
    if (t - last >= 1) {
      keep.push(i);
      last = t;
    }
  });
  const stride = Math.max(1, Math.ceil(keep.length / limit));
  const rows = keep.filter((_, k) => k % stride === 0);
  const pick = <T>(xs: readonly T[] | undefined) => (xs ? rows.map((i) => xs[i] as T) : undefined);
  const out: ImportedStreams = { time: rows.map((i) => streams.time[i] ?? 0) };
  for (const key of [
    "heartRate",
    "speed",
    "distance",
    "altitude",
    "cadence",
    "power",
    "latitude",
    "longitude",
  ] as const) {
    const column = pick(streams[key]);
    if (column && column.some((v) => v != null)) out[key] = column;
  }
  return out;
}

/** Douglas–Peucker simplification of a GPS track (tolerance in metres), for drawing routes. */
export function simplifyRoute(
  points: readonly [number, number][],
  toleranceM = 5,
): [number, number][] {
  const first0 = points[0];
  if (points.length <= 2 || !first0) return [...points];
  // Local equirectangular projection to metres: accurate enough within one activity.
  const lat0 = rad(first0[0]);
  const xy = points.map(
    ([la, lo]) => [rad(lo) * Math.cos(lat0) * EARTH_RADIUS_M, rad(la) * EARTH_RADIUS_M] as const,
  );
  const at = (i: number) => xy[i] ?? ([0, 0] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  for (let range = stack.pop(); range; range = stack.pop()) {
    const [first, last] = range;
    const [x1, y1] = at(first);
    const [x2, y2] = at(last);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [x, y] = at(i);
      const d =
        len === 0
          ? Math.hypot(x - x1, y - y1)
          : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** The GPS track of the streams as [lat, lon] pairs (points without a fix are skipped). */
export function trackOf(streams: ImportedStreams): [number, number][] {
  const { latitude, longitude } = streams;
  if (!latitude || !longitude) return [];
  const out: [number, number][] = [];
  latitude.forEach((la, i) => {
    const lo = longitude[i];
    if (la != null && lo != null) out.push([la, lo]);
  });
  return out;
}

export const round = (v: number | null, digits = 0): number | null =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;
