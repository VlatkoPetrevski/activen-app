import type { RouteDto } from "@activen/contracts";
import { useI18n } from "../i18n/I18nContext.js";
import {
  distanceMarkers,
  fitViewport,
  project,
  TILE_SIZE,
  tilesFor,
  type LatLon,
} from "../lib/geo.js";

const W = 600;

/**
 * Route map: the GPS line with start, finish and kilometre markers. With `tiles`, OpenStreetMap
 * tiles are drawn underneath; without (offline, embedded demo), the route's own context: river,
 * parks, main roads and place names.
 */
export function RouteMap({
  route,
  tiles,
  distanceInMeters,
  height = 300,
}: {
  route: RouteDto;
  tiles: boolean;
  distanceInMeters: number | null;
  /** Height in viewBox units (width is 600): 300 on the detail page, smaller in lists. */
  height?: number;
}) {
  const H = height;
  const { t, f } = useI18n();
  const pts = route.points as LatLon[];
  if (pts.length < 2) return null;
  const v = fitViewport(pts, W, H);
  const xy = (p: LatLon) => {
    const [x, y] = project(p, v.z);
    return [x - v.x, y - v.y] as const;
  };
  const path = (line: LatLon[]) =>
    line
      .map((p, i) => {
        const [x, y] = xy(p);
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  // Markers every 1, 5 or 10 km — or miles, in the user's unit system.
  const unit = f.toMeters(1);
  const total = (distanceInMeters ?? 0) / unit;
  const step = (total > 30 ? 10 : total > 12 ? 5 : 1) * unit;
  // Out-and-back routes put markers on top of each other: keep the first of any close pair.
  const markers = distanceMarkers(pts, step, unit).reduce<
    { value: number; at: LatLon; x: number; y: number }[]
  >((kept, m) => {
    const [x, y] = xy(m.at);
    if (kept.every((k) => Math.hypot(k.x - x, k.y - y) > 22)) kept.push({ ...m, x, y });
    return kept;
  }, []);
  const [sx, sy] = xy(pts[0] as LatLon);
  const [ex, ey] = xy(pts.at(-1) as LatLon);
  const loop = Math.hypot(sx - ex, sy - ey) < 14;
  // Place names are context, never clutter: drop any that would be clipped by the frame
  // or collide with a km marker, the start/finish dots or another name.
  const trace = pts.map((p) => {
    const [x, y] = xy(p);
    return { x, y };
  });
  const obstacles = [...markers, { x: sx, y: sy }, { x: ex, y: ey }];
  const placeLabels = (route.context?.labels ?? []).reduce<
    { text: string; x: number; y: number }[]
  >((kept, l) => {
    const [x, y] = xy(l.at as LatLon);
    const half = l.text.length * 3.6 + 4;
    const inside = x - half > 0 && x + half < W && y - 12 > 0 && y + 4 < H;
    const hits = (o: { x: number; y: number }, w: number) =>
      Math.abs(o.x - x) < half + w && o.y - y < 16 && y - o.y < 20;
    if (
      inside &&
      !obstacles.some((o) => hits(o, 10)) &&
      !trace.some((o) => Math.abs(o.x - x) < half && y - o.y < 13 && o.y - y < 4) &&
      !kept.some((k) => hits(k, k.text.length * 3.6 + 4))
    )
      kept.push({ text: l.text, x, y });
    return kept;
  }, []);
  return (
    <figure className="route-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("map.title")}>
        <rect width={W} height={H} className="route-bg" />
        {tiles &&
          tilesFor(v).map((tile) => (
            <image
              key={`${tile.z}/${tile.x}/${tile.y}`}
              href={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
              x={tile.left}
              y={tile.top}
              width={TILE_SIZE}
              height={TILE_SIZE}
              className="route-tile"
            />
          ))}
        {!tiles && (
          <>
            <defs>
              <pattern id="route-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" className="route-grid" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#route-grid)" />
            {(route.context?.parks ?? []).map((poly, i) => (
              <path key={`p${i}`} d={`${path(poly as LatLon[])} Z`} className="route-park" />
            ))}
            {(route.context?.roads ?? []).map((line, i) => (
              <path key={`r${i}`} d={path(line as LatLon[])} className="route-road" />
            ))}
            {(route.context?.water ?? []).map((line, i) => (
              <path key={`w${i}`} d={path(line as LatLon[])} className="route-water" />
            ))}
            {placeLabels.map(({ text, x, y }) => (
              <text key={text} x={x} y={y} textAnchor="middle" className="route-label">
                {text}
              </text>
            ))}
          </>
        )}
        <path d={path(pts)} className="route-casing" />
        <path d={path(pts)} className="route-line" />
        {markers.map(({ value, x, y }) => (
          <g key={value} className="route-km">
            <circle cx={x} cy={y} r={9} />
            <text x={x} y={y + 3.5} textAnchor="middle">
              {value}
            </text>
          </g>
        ))}
        <circle cx={sx} cy={sy} r={8} className="route-start">
          <title>{t("map.start")}</title>
        </circle>
        {!loop && (
          <circle cx={ex} cy={ey} r={8} className="route-finish">
            <title>{t("map.finish")}</title>
          </circle>
        )}
      </svg>
      {tiles && <figcaption className="route-attribution">{t("map.attribution")}</figcaption>}
    </figure>
  );
}
