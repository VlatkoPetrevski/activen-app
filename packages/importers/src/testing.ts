/**
 * Test files for this package and its users (API tests): deterministic FIT, GPX and TCX.
 * Not used by production code.
 */
import { Encoder, Profile } from "@garmin/fitsdk";

/**
 * Deterministic test files. FIT files are written with Garmin's own encoder, so they are byte
 * for byte what a device produces; GPX and TCX follow the Garmin/Strava export shapes.
 */
export const START = new Date("2026-11-18T06:00:00Z");
const FIT_EPOCH = 631_065_600;
const MESG = {
  ACTIVITY: Profile.MesgNum.ACTIVITY ?? 0,
  DEVICE_INFO: Profile.MesgNum.DEVICE_INFO ?? 0,
  FILE_ID: Profile.MesgNum.FILE_ID ?? 0,
  LAP: Profile.MesgNum.LAP ?? 0,
  RECORD: Profile.MesgNum.RECORD ?? 0,
  SESSION: Profile.MesgNum.SESSION ?? 0,
  SET: Profile.MesgNum.SET ?? 0,
};
const BOM = "\uFEFF";
const SEMI = 2 ** 31 / 180;
/** Skopje, by the Vardar. */
const LAT0 = 41.9981;
const LON0 = 21.4254;

interface Phase {
  intensity: "warmup" | "active" | "recovery" | "cooldown";
  seconds: number;
  speed: number;
  hr: number;
}

/** Warm-up, 3 × (1 km fast + 90 s easy), cool-down. 1 Hz records heading north-east. */
export const INTERVAL_PHASES: Phase[] = [
  { intensity: "warmup", seconds: 600, speed: 3.0, hr: 130 },
  ...[1, 2, 3].flatMap(() => [
    { intensity: "active" as const, seconds: 240, speed: 4.17, hr: 168 },
    { intensity: "recovery" as const, seconds: 90, speed: 2.5, hr: 140 },
  ]),
  { intensity: "cooldown", seconds: 300, speed: 2.8, hr: 128 },
];

/** The SDK's message types are narrower than its runtime accepts; tests write plain objects. */
const write = (e: Encoder, mesgNum: number, mesg: Record<string, unknown>) =>
  e.onMesg(mesgNum, mesg as never);

export interface FitOptions {
  sport?: string;
  subSport?: string;
  product?: number;
  manufacturer?: string;
  strap?: boolean;
  withSession?: boolean;
  phases?: Phase[];
  offsetSeconds?: number;
  sets?: { category: string; reps: number; weight: number }[];
  fileType?: string;
  extraSession?: boolean;
}

export function intervalRunFit(o: FitOptions = {}): Uint8Array {
  const e = new Encoder();
  const phases = o.phases ?? INTERVAL_PHASES;
  const at = (s: number) => new Date(START.getTime() + s * 1000);
  write(e, MESG.FILE_ID, {
    manufacturer: o.manufacturer ?? "garmin",
    product: o.product ?? 4315,
    timeCreated: START,
    type: o.fileType ?? "activity",
    serialNumber: 3_000_000_001,
  });
  write(e, MESG.DEVICE_INFO, {
    timestamp: START,
    manufacturer: o.manufacturer ?? "garmin",
    product: o.product ?? 4315,
    deviceIndex: "creator",
    softwareVersion: 21.19,
  });
  if (o.strap)
    write(e, MESG.DEVICE_INFO, {
      timestamp: START,
      manufacturer: "garmin",
      deviceType: 120,
      deviceIndex: 1,
      sourceType: "antplus",
    });
  let t = 0;
  let dist = 0;
  let lat = LAT0;
  let lon = LON0;
  for (const p of phases) {
    const lapStart = t;
    const lapDist = dist;
    for (let i = 0; i < p.seconds; i++) {
      dist += p.speed;
      lat += (p.speed / 111_320) * 0.7;
      lon += (p.speed / (111_320 * Math.cos((LAT0 * Math.PI) / 180))) * 0.7;
      write(e, MESG.RECORD, {
        timestamp: at(t),
        heartRate: p.hr,
        positionLat: Math.round(lat * SEMI),
        positionLong: Math.round(lon * SEMI),
        enhancedSpeed: p.speed,
        distance: dist,
        enhancedAltitude: 240 + Math.round(t / 60),
        cadence: 85,
        power: 250,
      });
      t++;
    }
    write(e, MESG.LAP, {
      timestamp: at(t),
      startTime: at(lapStart),
      totalElapsedTime: p.seconds,
      totalTimerTime: p.seconds,
      totalDistance: dist - lapDist,
      avgHeartRate: p.hr,
      maxHeartRate: p.hr + 4,
      intensity: p.intensity,
      avgPower: 250,
    });
  }
  for (const s of o.sets ?? [])
    write(e, MESG.SET, {
      timestamp: at(t),
      setType: "active",
      category: [s.category],
      repetitions: s.reps,
      weight: s.weight,
      duration: 40,
    });
  if (o.withSession !== false) {
    const session = {
      timestamp: at(t),
      startTime: START,
      totalElapsedTime: t,
      totalTimerTime: t - 20,
      totalDistance: dist,
      sport: o.sport ?? "running",
      subSport: o.subSport ?? "generic",
      avgHeartRate: 150,
      maxHeartRate: 172,
      totalCalories: 640,
      totalAscent: 31,
      trainingLoadPeak: 142.4,
      avgPower: 250,
    };
    write(e, MESG.SESSION, session);
    if (o.extraSession)
      write(e, MESG.SESSION, {
        ...session,
        startTime: at(t),
        sport: "cycling",
        subSport: "road",
        totalElapsedTime: 600,
        totalTimerTime: 600,
        totalDistance: 5000,
        avgHeartRate: 120,
        maxHeartRate: 180,
        totalAscent: 9,
        trainingLoadPeak: 20,
      });
  }
  write(e, MESG.ACTIVITY, {
    timestamp: at(t),
    localTimestamp: START.getTime() / 1000 + t + (o.offsetSeconds ?? 3600) - FIT_EPOCH,
    numSessions: 1,
    type: "manual",
  });
  return e.close();
}

/** Strava-style GPX: run with heart rate and cadence in Garmin TrackPointExtension. */
export function stravaGpx(points = 600, opts: { times?: boolean; type?: string } = {}): string {
  const rows: string[] = [];
  for (let i = 0; i < points; i++) {
    const lat = (LAT0 + i * 0.00002).toFixed(7);
    const lon = (LON0 + i * 0.00002).toFixed(7);
    const time = new Date(START.getTime() + i * 1000).toISOString();
    rows.push(
      `<trkpt lat="${lat}" lon="${lon}"><ele>${(240 + (i % 120 < 60 ? i % 60 : 60 - (i % 60)) / 2).toFixed(1)}</ele>` +
        (opts.times === false ? "" : `<time>${time}</time>`) +
        `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + (i % 10)}</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`,
    );
  }
  return `${BOM}<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>${START.toISOString()}</time></metadata>
 <trk><name>Вечерно трчање</name><type>${opts.type ?? "running"}</type><trkseg>${rows.join("")}</trkseg></trk>
</gpx>`;
}

/** Garmin Training Center export: two laps (active + resting) with track points. */
export function garminTcx(): string {
  const point = (s: number, d: number, hr: number) =>
    `<Trackpoint><Time>${new Date(START.getTime() + s * 1000).toISOString()}</Time>` +
    `<Position><LatitudeDegrees>${(LAT0 + s * 0.00003).toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${LON0}</LongitudeDegrees></Position>` +
    `<AltitudeMeters>${240 + s / 100}</AltitudeMeters><DistanceMeters>${d}</DistanceMeters>` +
    `<HeartRateBpm><Value>${hr}</Value></HeartRateBpm>` +
    `<Extensions><ns3:TPX><ns3:Speed>3.3</ns3:Speed><ns3:RunCadence>86</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`;
  const lap1 = Array.from({ length: 300 }, (_, i) => point(i, i * 3.3, 150)).join("");
  const lap2 = Array.from({ length: 120 }, (_, i) => point(300 + i, 990 + i, 120)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities><Activity Sport="Running"><Id>${START.toISOString()}</Id>
  <Lap StartTime="${START.toISOString()}"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>990</DistanceMeters><Calories>60</Calories>
   <AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>158</Value></MaximumHeartRateBpm><Intensity>Active</Intensity><Track>${lap1}</Track></Lap>
  <Lap StartTime="${new Date(START.getTime() + 300_000).toISOString()}"><TotalTimeSeconds>120</TotalTimeSeconds><DistanceMeters>120</DistanceMeters><Calories>10</Calories>
   <AverageHeartRateBpm><Value>120</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>131</Value></MaximumHeartRateBpm><Intensity>Resting</Intensity><Track>${lap2}</Track></Lap>
  <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>Forerunner 265</Name></Creator>
 </Activity></Activities>
 <Author><Name>Garmin Connect</Name></Author>
</TrainingCenterDatabase>`;
}

export const bytesOf = (s: string) => new TextEncoder().encode(s);
