import { Decoder, Stream } from "@garmin/fitsdk";
import { max, round } from "./derive.js";
import {
  ImportError,
  type ImportedActivity,
  type ImportedDevice,
  type ImportedExercise,
  type ImportedLap,
  type ImportedLapIntensity,
  type ImportedStreams,
} from "./model.js";
import { fitActivityType } from "./sport.js";
import { finishActivity } from "./finish.js";

/** Unix seconds of the FIT epoch (1989-12-31T00:00:00Z); FIT local times count from it. */
const FIT_EPOCH = 631_065_600;
/** FIT positions are semicircles: 2^31 semicircles = 180°. */
const SEMICIRCLE = 180 / 2 ** 31;

type Mesg = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const seconds = (v: unknown): number | null =>
  v instanceof Date ? Math.round(v.getTime() / 1000) : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A FIT stream over the bytes (one copy, so the caller's buffer is never shared). */
const streamOf = (bytes: Uint8Array) =>
  Stream.fromArrayBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );

export function isFit(bytes: Uint8Array): boolean {
  try {
    return Decoder.isFIT(streamOf(bytes));
  } catch {
    return false;
  }
}

/** Reads an activity FIT file (watch, bike computer, Polar/Suunto/COROS export). */
export function parseFit(bytes: Uint8Array): ImportedActivity {
  const decoder = new Decoder(streamOf(bytes));
  if (!decoder.isFIT()) throw new ImportError("corrupt", "Not a FIT file");
  const { messages, errors } = decoder.read({ mergeHeartRates: true });
  const sessions = (messages.sessionMesgs ?? []) as Mesg[];
  const records = (messages.recordMesgs ?? []) as Mesg[];
  // A truncated file (watch battery died) still decodes its records; only fail with nothing usable.
  if (errors.length && sessions.length === 0 && records.length === 0)
    throw new ImportError("corrupt", String(errors[0]));
  const fileType = ((messages.fileIdMesgs ?? []) as Mesg[])[0]?.type;
  if (fileType && fileType !== "activity")
    throw new ImportError("no_activity", `FIT file of type ${String(fileType)}`);
  if (sessions.length === 0 && records.length === 0)
    throw new ImportError("no_activity", "No session or records");

  const firstRecord = records.find((r) => r.timestamp instanceof Date);
  const start = seconds(sessions[0]?.startTime) ?? seconds(firstRecord?.timestamp) ?? null;
  if (start == null) throw new ImportError("no_activity", "No start time");

  const streams = recordStreams(records, start);
  const totals = sessionTotals(sessions);
  const device = deviceOf(messages as Record<string, Mesg[] | undefined>);
  const activityType =
    sessions.length > 1
      ? "MULTI_SPORT"
      : sessions.length === 1
        ? fitActivityType(sessions[0]?.sport, sessions[0]?.subSport)
        : // A file cut off before its summary: a bike computer records rides.
          /^Edge /.test(device.deviceName ?? "")
          ? "CYCLING"
          : "OTHER";
  // Running cadence is recorded per foot; spm doubles it.
  if (streams.cadence && /RUN|WALK|HIK/.test(activityType))
    streams.cadence = streams.cadence.map((c) => (c == null ? null : c * 2));

  const activity = ((messages.activityMesgs ?? []) as Mesg[])[0];
  const localTs = num(activity?.localTimestamp);
  const ts = seconds(activity?.timestamp);
  const offset = localTs != null && ts != null ? localTs + FIT_EPOCH - ts : null;

  return finishActivity({
    format: "fit",
    activityType,
    activityName: null,
    startTimeInSeconds: start,
    // Offsets are whole quarter hours; anything else is clock drift, not a time zone.
    startTimeOffsetInSeconds: offset != null && offset % 900 === 0 ? offset : null,
    durationInSeconds: totals.elapsed ?? 0,
    movingDurationInSeconds: totals.timer,
    distanceInMeters: totals.distance,
    totalElevationGainInMeters: totals.ascent,
    averageHeartRateInBeatsPerMinute: totals.avgHr,
    maxHeartRateInBeatsPerMinute: totals.maxHr,
    averagePowerInWatts: totals.avgPower,
    activeKilocalories: totals.calories,
    trainingLoad: totals.load,
    laps: ((messages.lapMesgs ?? []) as Mesg[]).map((l) => lapOf(l, start)),
    streams,
    device,
    exercises: exercisesOf((messages.setMesgs ?? []) as Mesg[]),
    rating: ratingOf(sessions),
  });
}

/**
 * The rating the athlete gave on the watch: FIT `session.workout_rpe` is RPE × 10 (0–100) and
 * `session.workout_feel` 0–100 in steps of 25 (very weak … very strong).
 */
export function ratingOf(sessions: readonly Mesg[]): ImportedActivity["rating"] {
  const first = (key: string) =>
    sessions.map((s) => num(s[key])).find((v): v is number => v != null && v >= 0 && v <= 100) ??
    null;
  const rpe = first("workoutRpe");
  const feel = first("workoutFeel");
  const perceivedEffort = rpe === null ? null : Math.min(10, Math.max(1, Math.round(rpe / 10)));
  const feelScale = feel === null ? null : Math.min(5, Math.max(1, Math.round(feel / 25) + 1));
  return perceivedEffort === null && feelScale === null
    ? null
    : { perceivedEffort, feel: feelScale };
}

function sessionTotals(sessions: Mesg[]) {
  const sum = (key: string) => {
    const xs = sessions.map((s) => num(s[key])).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const weighted = (key: string) => {
    let total = 0;
    let weight = 0;
    for (const s of sessions) {
      const v = num(s[key]);
      const w = num(s.totalTimerTime) ?? num(s.totalElapsedTime) ?? 0;
      if (v != null && w > 0) {
        total += v * w;
        weight += w;
      }
    }
    return weight ? total / weight : null;
  };
  const maxOf = (key: string) => max(sessions.map((s) => num(s[key])));
  return {
    elapsed: round(sum("totalElapsedTime")),
    timer: round(sum("totalTimerTime")),
    distance: round(sum("totalDistance"), 1),
    ascent: sum("totalAscent"),
    calories: sum("totalCalories"),
    avgHr: round(weighted("avgHeartRate")),
    maxHr: maxOf("maxHeartRate"),
    avgPower: round(weighted("avgPower")),
    load: round(sum("trainingLoadPeak"), 1),
  };
}

function recordStreams(records: Mesg[], start: number): ImportedStreams {
  const rows = records.filter((r) => r.timestamp instanceof Date);
  const col = (pick: (r: Mesg) => number | null) => rows.map(pick);
  const lat = col((r) => {
    const v = num(r.positionLat);
    return v == null ? null : v * SEMICIRCLE;
  });
  const lon = col((r) => {
    const v = num(r.positionLong);
    return v == null ? null : v * SEMICIRCLE;
  });
  return {
    time: rows.map((r) => (seconds(r.timestamp) ?? start) - start),
    heartRate: col((r) => num(r.heartRate)),
    speed: col((r) => num(r.enhancedSpeed) ?? num(r.speed)),
    distance: col((r) => num(r.distance)),
    altitude: col((r) => num(r.enhancedAltitude) ?? num(r.altitude)),
    cadence: col((r) => num(r.cadence)),
    power: col((r) => num(r.power)),
    latitude: lat,
    longitude: lon,
  };
}

const INTENSITIES: readonly ImportedLapIntensity[] = [
  "warmup",
  "active",
  "recovery",
  "rest",
  "cooldown",
];

function lapOf(l: Mesg, start: number): ImportedLap {
  const intensity = INTENSITIES.find((i) => i === l.intensity) ?? "active";
  const lapStart = seconds(l.startTime) ?? start;
  return {
    intensity,
    startOffsetInSeconds: Math.max(0, lapStart - start),
    durationInSeconds: Math.round(num(l.totalElapsedTime) ?? num(l.totalTimerTime) ?? 0),
    movingDurationInSeconds: round(num(l.totalTimerTime)),
    distanceInMeters: round(num(l.totalDistance), 1),
    averageHeartRateInBeatsPerMinute: num(l.avgHeartRate),
    maxHeartRateInBeatsPerMinute: num(l.maxHeartRate),
    averagePowerInWatts: num(l.avgPower),
  };
}

/** Garmin product ids as the SDK names them ("fr965", "fenix7Pro") → "Forerunner 965", "fēnix 7 Pro". */
const FAMILIES: [RegExp, string][] = [
  [/^fr/, "Forerunner "],
  [/^fenix/, "fēnix "],
  [/^epix/, "epix "],
  [/^edge/, "Edge "],
  [/^venu/, "Venu "],
  [/^vivoactive/, "vívoactive "],
  [/^instinct/, "Instinct "],
  [/^enduro/, "Enduro "],
  [/^marq/, "MARQ "],
  [/^approach/, "Approach "],
  [/^descent/, "Descent "],
];

export function garminProductName(id: string): string {
  for (const [re, family] of FAMILIES)
    if (re.test(id)) {
      const rest = id
        .replace(re, "")
        .replace(/([a-z])(\d)/gi, "$1 $2")
        .replace(/(\d)([a-z])/gi, "$1 $2")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim();
      return (family + rest.replace(/\b[a-z]/g, (c) => c.toUpperCase())).trim();
    }
  return id;
}

const MANUFACTURERS: Record<string, string> = {
  garmin: "Garmin",
  polar: "Polar",
  polarElectro: "Polar",
  suunto: "Suunto",
  coros: "COROS",
  wahooFitness: "Wahoo",
  suuntoOy: "Suunto",
  hammerhead: "Hammerhead",
  zwift: "Zwift",
  stryd: "Stryd",
  apple: "Apple",
  development: "Developer",
};

function deviceOf(messages: Record<string, Mesg[] | undefined>): ImportedDevice {
  const fileId = messages.fileIdMesgs?.[0] ?? {};
  const devices = messages.deviceInfoMesgs ?? [];
  const creator = devices.find((d) => d.deviceIndex === "creator") ?? {};
  const manufacturer = text(fileId.manufacturer) ?? text(creator.manufacturer);
  const product =
    text(fileId.garminProduct) ??
    text(creator.garminProduct) ??
    text(creator.productName) ??
    text(fileId.productName);
  const brand = manufacturer ? (MANUFACTURERS[manufacturer] ?? manufacturer) : null;
  const deviceName = product
    ? manufacturer === "garmin"
      ? garminProductName(product)
      : `${brand ?? ""} ${product}`.trim()
    : brand;
  // An external heart-rate sensor (ANT+ device type 120, or a BLE HR device) means a strap.
  const strap = devices.some(
    (d) =>
      d.deviceIndex !== "creator" &&
      (d.antplusDeviceType === "heartRate" ||
        d.deviceType === 120 ||
        d.bleDeviceType === "heartRate"),
  );
  const hasHr = ((messages.recordMesgs ?? []) as Mesg[]).some((r) => num(r.heartRate) != null);
  return {
    manufacturer,
    deviceName,
    heartRateSensor: strap ? "chest_strap" : hasHr ? "optical" : null,
    creator: null,
  };
}

/** FIT `set` messages of strength sessions grouped into exercises in order. */
function exercisesOf(sets: Mesg[]): ImportedExercise[] {
  const out: ImportedExercise[] = [];
  for (const s of sets) {
    if (s.setType !== "active") continue;
    const categoryRaw = Array.isArray(s.category) ? s.category[0] : s.category;
    const category =
      typeof categoryRaw === "string"
        ? categoryRaw.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()
        : "UNKNOWN";
    const set = {
      reps: num(s.repetitions),
      weightInKilograms: num(s.weight),
      durationInSeconds: round(num(s.duration)),
    };
    const last = out[out.length - 1];
    if (last && last.category === category) last.sets.push(set);
    else out.push({ category, name: null, sets: [set] });
  }
  return out;
}
