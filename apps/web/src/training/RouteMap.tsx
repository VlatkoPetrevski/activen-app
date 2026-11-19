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
const H = 300;

/**
 * Route map: the GPS line with start, finish and kilometre markers. With `tiles`, OpenStreetMap
 * tiles are drawn underneath; without (offline, embedded demo), a calm background with rivers.
 */
export function RouteMap({
  route,
  tiles,
  distanceInMeters,
}: {
  route: RouteDto;
  tiles: boolean;
  distanceInMeters: number | null;
}) {
  const { t } = useI18n();
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
  const total = distanceInMeters ?? 0;
  const step = total > 30_000 ? 10_000 : total > 12_000 ? 5_000 : 1_000;
  // Out-and-back routes put markers on top of each other: keep the first of any close pair.
  const markers = distanceMarkers(pts, step).reduce<
    { km: number; at: LatLon; x: number; y: number }[]
  >((kept, m) => {
    const [x, y] = xy(m.at);
    if (kept.every((k) => Math.hypot(k.x - x, k.y - y) > 22)) kept.push({ ...m, x, y });
    return kept;
  }, []);
  const [sx, sy] = xy(pts[0] as LatLon);
  const [ex, ey] = xy(pts.at(-1) as LatLon);
  const loop = Math.hypot(sx - ex, sy - ey) < 14;
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
            {(route.water ?? []).map((line, i) => (
              <path key={i} d={path(line as LatLon[])} className="route-water" />
            ))}
          </>
        )}
        <path d={path(pts)} className="route-casing" />
        <path d={path(pts)} className="route-line" />
        {markers.map(({ km, x, y }) => (
          <g key={km} className="route-km">
            <circle cx={x} cy={y} r={9} />
            <text x={x} y={y + 3.5} textAnchor="middle">
              {km}
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
