/** Web Mercator helpers for drawing a route (and, where allowed, map tiles) in an SVG. */

export type LatLon = [number, number];
const TILE = 256;

/** World pixel coordinates at zoom z (the same space as standard XYZ map tiles). */
export function project([lat, lon]: LatLon, z: number): [number, number] {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [
    ((lon + 180) / 360) * scale,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  ];
}

export interface Viewport {
  z: number;
  /** viewBox origin and size in world pixels at zoom z. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largest zoom (≤ 17) at which all points fit into width × height with padding, centred. */
export function fitViewport(
  points: LatLon[],
  width: number,
  height: number,
  padding = 24,
): Viewport {
  for (let z = 17; z >= 1; z--) {
    const px = points.map((p) => project(p, z));
    const xs = px.map((p) => p[0]);
    const ys = px.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    if (maxX - minX <= width - 2 * padding && maxY - minY <= height - 2 * padding)
      return {
        z,
        x: (minX + maxX) / 2 - width / 2,
        y: (minY + maxY) / 2 - height / 2,
        width,
        height,
      };
  }
  const [cx, cy] = project(points[0] ?? [0, 0], 1);
  return { z: 1, x: cx - width / 2, y: cy - height / 2, width, height };
}

/** XYZ tiles covering the viewport, with their position inside the viewport. */
export function tilesFor(
  v: Viewport,
): { x: number; y: number; z: number; left: number; top: number }[] {
  const max = 2 ** v.z;
  const out: { x: number; y: number; z: number; left: number; top: number }[] = [];
  for (let tx = Math.floor(v.x / TILE); tx <= Math.floor((v.x + v.width) / TILE); tx++)
    for (let ty = Math.floor(v.y / TILE); ty <= Math.floor((v.y + v.height) / TILE); ty++)
      if (ty >= 0 && ty < max)
        out.push({
          x: ((tx % max) + max) % max,
          y: ty,
          z: v.z,
          left: tx * TILE - v.x,
          top: ty * TILE - v.y,
        });
  return out;
}

export const TILE_SIZE = TILE;

/** Great-circle distance in metres (haversine). */
export function meters(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Points where each whole `step` metres is reached along the route (km markers). */
export function distanceMarkers(points: LatLon[], step: number): { km: number; at: LatLon }[] {
  const out: { km: number; at: LatLon }[] = [];
  let walked = 0;
  let next = step;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as LatLon;
    const b = points[i] as LatLon;
    const d = meters(a, b);
    while (d > 0 && walked + d >= next) {
      const f = (next - walked) / d;
      out.push({ km: next / 1000, at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] });
      next += step;
    }
    walked += d;
  }
  return out;
}
