import { XMLParser } from "fast-xml-parser";
import { round } from "./derive.js";
import { finishActivity } from "./finish.js";
import {
  ImportError,
  type ImportedActivity,
  type ImportedLap,
  type ImportedStreams,
} from "./model.js";
import { textActivityType } from "./sport.js";

/**
 * Namespace prefixes are dropped (gpxtpx:hr → hr), entities are not expanded (no XXE or
 * "billion laughs"), and repeated elements always come back as arrays.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  isArray: (name) =>
    ["trk", "trkseg", "trkpt", "Activity", "Lap", "Track", "Trackpoint"].includes(name),
});

type Node = Record<string, unknown>;

const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : []);
const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "#text" in v) return str((v as Node)["#text"]);
  return null;
};
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const time = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms / 1000;
};

/** Finds a value anywhere under an `extensions` node (vendors nest them differently). */
function ext(node: unknown, ...names: string[]): number | null {
  if (!node || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node as Node)) {
    if (names.includes(key)) {
      const n = num(value);
      if (n != null) return n;
    }
    if (value && typeof value === "object") {
      const n = ext(value, ...names);
      if (n != null) return n;
    }
  }
  return null;
}

function parse(xml: string): Node {
  try {
    return parser.parse(xml) as Node;
  } catch (err) {
    throw new ImportError("corrupt", err instanceof Error ? err.message : "Invalid XML");
  }
}

interface Point {
  t: number;
  lat: number | null;
  lon: number | null;
  ele: number | null;
  dist: number | null;
  hr: number | null;
  cad: number | null;
  power: number | null;
  speed: number | null;
}

function streamsOf(points: Point[], start: number): ImportedStreams {
  const col = (k: keyof Point) => points.map((p) => p[k]);
  return {
    time: points.map((p) => Math.round(p.t - start)),
    latitude: col("lat"),
    longitude: col("lon"),
    altitude: col("ele"),
    distance: col("dist"),
    heartRate: col("hr"),
    cadence: col("cad"),
    power: col("power"),
    speed: col("speed"),
  };
}

const sorted = (points: Point[]) =>
  points.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);

/** GPX 1.1 (Garmin, Strava, Komoot exports; heart rate/cadence/power from extensions). */
export function parseGpx(xml: string): ImportedActivity {
  const root = parse(xml);
  if (!("gpx" in root)) throw new ImportError("unsupported_format", "No <gpx> root");
  const gpx = (root.gpx && typeof root.gpx === "object" ? root.gpx : {}) as Node;
  const tracks = arr(gpx.trk);
  const points = sorted(
    tracks.flatMap((trk) =>
      arr(trk.trkseg).flatMap((seg) =>
        arr(seg.trkpt).map((p) => ({
          t: time(p.time) ?? Number.NaN,
          lat: num(p["@lat"]),
          lon: num(p["@lon"]),
          ele: num(p.ele),
          dist: null,
          hr: ext(p.extensions, "hr", "heartrate"),
          cad: ext(p.extensions, "cad", "cadence"),
          power: ext(p.extensions, "power", "watts", "PowerInWatts"),
          speed: ext(p.extensions, "speed"),
        })),
      ),
    ),
  );
  // A route or a track without timestamps is a plan, not an activity.
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2)
    throw new ImportError("no_activity", "No timed track points");
  const start = first.t;
  const trk = tracks[0] ?? {};
  const metadata = (gpx.metadata ?? {}) as Node;
  return finishActivity({
    format: "gpx",
    activityType: textActivityType(str(trk.type)) ?? "OTHER",
    activityName: str(trk.name) ?? str(metadata.name),
    startTimeInSeconds: Math.round(start),
    startTimeOffsetInSeconds: null,
    durationInSeconds: Math.round(last.t - start),
    movingDurationInSeconds: null,
    distanceInMeters: null,
    totalElevationGainInMeters: null,
    averageHeartRateInBeatsPerMinute: null,
    maxHeartRateInBeatsPerMinute: null,
    averagePowerInWatts: null,
    activeKilocalories: null,
    trainingLoad: null,
    laps: [],
    streams: streamsOf(points, start),
    device: {
      manufacturer: null,
      deviceName: null,
      heartRateSensor: null,
      creator: str(gpx["@creator"]),
    },
    exercises: [],
    rating: null,
  });
}

/** TCX (Garmin Training Center): laps with totals and track points. */
export function parseTcx(xml: string): ImportedActivity {
  const root = parse(xml);
  if (!("TrainingCenterDatabase" in root))
    throw new ImportError("unsupported_format", "No <TrainingCenterDatabase> root");
  const db = (
    root.TrainingCenterDatabase && typeof root.TrainingCenterDatabase === "object"
      ? root.TrainingCenterDatabase
      : {}
  ) as Node;
  const activity = arr((db.Activities as Node | undefined)?.Activity)[0];
  if (!activity) throw new ImportError("no_activity", "No <Activity>");
  const laps = arr(activity.Lap);
  const points = sorted(
    laps.flatMap((lap) =>
      arr(lap.Track).flatMap((track) =>
        arr(track.Trackpoint).map((p) => {
          const pos = (p.Position ?? {}) as Node;
          return {
            t: time(p.Time) ?? Number.NaN,
            lat: num(pos.LatitudeDegrees),
            lon: num(pos.LongitudeDegrees),
            ele: num(p.AltitudeMeters),
            dist: num(p.DistanceMeters),
            hr: num((p.HeartRateBpm as Node | undefined)?.Value),
            cad: num(p.Cadence) ?? ext(p.Extensions, "RunCadence"),
            power: ext(p.Extensions, "Watts"),
            speed: ext(p.Extensions, "Speed"),
          };
        }),
      ),
    ),
  );
  const start = time(activity.Id) ?? time(laps[0]?.["@StartTime"]) ?? points[0]?.t ?? null;
  if (start == null) throw new ImportError("no_activity", "No start time");
  const lapsOut: ImportedLap[] = laps.map((lap) => {
    const lapStart = time(lap["@StartTime"]) ?? start;
    return {
      intensity: str(lap.Intensity) === "Resting" ? "rest" : "active",
      startOffsetInSeconds: Math.max(0, Math.round(lapStart - start)),
      durationInSeconds: Math.round(num(lap.TotalTimeSeconds) ?? 0),
      movingDurationInSeconds: null,
      distanceInMeters: round(num(lap.DistanceMeters), 1),
      averageHeartRateInBeatsPerMinute: num((lap.AverageHeartRateBpm as Node | undefined)?.Value),
      maxHeartRateInBeatsPerMinute: num((lap.MaximumHeartRateBpm as Node | undefined)?.Value),
      averagePowerInWatts: ext(lap.Extensions, "AvgWatts"),
    };
  });
  const sum = (pick: (l: Node) => number | null) => {
    const xs = laps.map(pick).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const lastLap = lapsOut[lapsOut.length - 1];
  const elapsed = lastLap ? lastLap.startOffsetInSeconds + lastLap.durationInSeconds : 0;
  const hrs = lapsOut
    .map((l) => l.maxHeartRateInBeatsPerMinute)
    .filter((v): v is number => v != null);
  const creator = (activity.Creator ?? {}) as Node;
  const author = (db.Author ?? {}) as Node;
  const deviceName = str(creator.Name);
  return finishActivity({
    format: "tcx",
    activityType: textActivityType(str(activity["@Sport"])) ?? "OTHER",
    activityName: str(activity.Notes),
    startTimeInSeconds: Math.round(start),
    startTimeOffsetInSeconds: null,
    durationInSeconds: Math.round(elapsed),
    movingDurationInSeconds: Math.round(sum((l) => num(l.TotalTimeSeconds)) ?? 0) || null,
    distanceInMeters: round(
      sum((l) => num(l.DistanceMeters)),
      1,
    ),
    totalElevationGainInMeters: null,
    averageHeartRateInBeatsPerMinute: null,
    maxHeartRateInBeatsPerMinute: hrs.length ? Math.max(...hrs) : null,
    averagePowerInWatts: null,
    activeKilocalories: sum((l) => num(l.Calories)),
    trainingLoad: null,
    laps: lapsOut,
    streams: streamsOf(points, start),
    device: {
      manufacturer: null,
      deviceName,
      heartRateSensor: null,
      creator: deviceName ? null : str(author.Name),
    },
    exercises: [],
    rating: null,
  });
}
