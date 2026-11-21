import type {
  ActivityLap,
  ActivityStreams,
  ActivityType,
  LapIntensity,
  RecordingDevice,
  StrengthExercise,
} from "@activen/domain";

/** File formats an athlete can upload. */
export type FileFormat = "fit" | "gpx" | "tcx";

export type ImportedLapIntensity = LapIntensity;
export type ImportedLap = ActivityLap;
export type ImportedStreams = ActivityStreams;
export type ImportedDevice = RecordingDevice;
export type ImportedExercise = StrengthExercise;

/** One activity read from a file, in the canonical (Garmin) vocabulary and units. */
export interface ImportedActivity {
  format: FileFormat;
  activityType: ActivityType;
  /** Name from the file (GPX/TCX), otherwise null; the caller names it. */
  activityName: string | null;
  /** Unix seconds UTC. */
  startTimeInSeconds: number;
  /** Device-local offset when the file records it (FIT), otherwise null. */
  startTimeOffsetInSeconds: number | null;
  durationInSeconds: number;
  movingDurationInSeconds: number | null;
  distanceInMeters: number | null;
  totalElevationGainInMeters: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  averagePowerInWatts: number | null;
  activeKilocalories: number | null;
  /** Garmin Training Load (FIT `session.training_load_peak`), when the device computed it. */
  trainingLoad: number | null;
  laps: ImportedLap[];
  streams: ImportedStreams;
  device: ImportedDevice;
  exercises: ImportedExercise[];
}

export type ImportErrorCode =
  "unsupported_format" | "corrupt" | "no_activity" | "too_large" | "empty";

/** A file that cannot become an activity; `code` is shown to the user as a localized message. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

/** Upload limit per file. Real activity files are well below it (a 10 h FIT is ~3 MB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
