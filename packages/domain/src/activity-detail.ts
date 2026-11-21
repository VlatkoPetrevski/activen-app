/**
 * What a detailed source adds to an activity: laps, recorded samples, the GPS route, the device
 * and strength sets. Produced by file importers and vendor adapters, stored per source activity.
 */

/** Lap intensity as recorded (FIT `lap.intensity`); sources without it report "active". */
export type LapIntensity = "warmup" | "active" | "recovery" | "rest" | "cooldown";

export interface ActivityLap {
  intensity: LapIntensity;
  /** Seconds from the activity start. */
  startOffsetInSeconds: number;
  /** Elapsed lap time, pauses included. */
  durationInSeconds: number;
  /** Timer time (pauses excluded), when the source says. */
  movingDurationInSeconds: number | null;
  distanceInMeters: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  averagePowerInWatts: number | null;
}

/**
 * Recorded samples, column per channel, one row per sample (at most one per second). A missing
 * value is `null`; a channel the source does not have is absent.
 */
export interface ActivityStreams {
  /** Seconds from the activity start; increasing. */
  time: number[];
  heartRate?: (number | null)[];
  /** Metres per second. */
  speed?: (number | null)[];
  /** Metres from the start. */
  distance?: (number | null)[];
  /** Metres above sea level. */
  altitude?: (number | null)[];
  /** Steps per minute for running and walking, revolutions per minute for cycling. */
  cadence?: (number | null)[];
  power?: (number | null)[];
  /** Degrees. */
  latitude?: (number | null)[];
  longitude?: (number | null)[];
}

export interface RecordingDevice {
  /** "garmin", "polarElectro", … as the source names the maker; null when unknown. */
  manufacturer: string | null;
  /** Human-readable model ("Forerunner 965"); null when the source does not say. */
  deviceName: string | null;
  /** Heart rate from a strap/arm sensor (ANT+/BLE) or the watch's optical sensor. */
  heartRateSensor: "chest_strap" | "optical" | null;
  /** Application that wrote the data when it is not a device (GPX `creator`, TCX author). */
  creator: string | null;
}

export interface StrengthExercise {
  /** Garmin exercise category (SQUAT, BENCH_PRESS, …). */
  category: string;
  name: string | null;
  sets: {
    reps: number | null;
    weightInKilograms: number | null;
    durationInSeconds: number | null;
  }[];
}

export interface ActivityDetail {
  laps: ActivityLap[];
  streams: ActivityStreams | null;
  /** Simplified GPS track as [latitude, longitude] pairs; null without GPS. */
  route: [number, number][] | null;
  device: RecordingDevice | null;
  exercises: StrengthExercise[];
}
