import { sameWorkout, type Activity, type ActivityType } from "@activen/domain";

interface WorkoutKey {
  activityType: ActivityType;
  startTimeInSeconds: number;
  durationInSeconds: number;
}

export type ImportOutcome =
  | { kind: "new" }
  /** The same workout was already uploaded as a file: nothing is stored. */
  | { kind: "duplicate"; activity: Activity }
  /** The same workout came from a connected app: the file joins it as a secondary source. */
  | { kind: "merged"; activity: Activity }
  /**
   * The athlete entered this workout by hand: the file (with its laps and route) takes its place
   * and keeps the check-in that was entered.
   */
  | { kind: "replaces"; activity: Activity };

/**
 * What an uploaded workout is, given the athlete's activities that started near it. Shared by
 * the API and the demo, so both refuse and merge exactly the same files.
 */
export function importOutcome(parsed: WorkoutKey, nearby: readonly Activity[]): ImportOutcome {
  const same = nearby.filter((a) => !a.deleted && sameWorkout(a, parsed));
  const uploaded = same.find((a) => a.source.vendor === "manual" && !isEnteredActivity(a));
  if (uploaded) return { kind: "duplicate", activity: uploaded };
  const app = same.find((a) => a.source.vendor !== "manual");
  if (app) return { kind: "merged", activity: app };
  const entered = same.find(isEnteredActivity);
  return entered ? { kind: "replaces", activity: entered } : { kind: "new" };
}

/**
 * A workout the athlete enters by hand (no watch, a forgotten recording, a gym session). Times are
 * local to the athlete's time zone; numbers are metric. Stored with vendor "manual" like uploaded
 * files; a later file of the same workout takes its place (keeping the check-in).
 */
export interface ManualActivityInput {
  activityType: ActivityType;
  /** Defaults to the sport's name. */
  activityName: string | null;
  /** Local date and start time ("HH:MM"). */
  date: string;
  startTime: string;
  durationInSeconds: number;
  distanceInMeters: number | null;
  totalElevationGainInMeters: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  averagePowerInWatts: number | null;
  activeKilocalories: number | null;
  /** The check-in, entered with the workout. */
  perceivedEffort: number | null;
  feel: number | null;
  comment: string | null;
}

/** Marks the external id of a hand-entered workout (vendor "manual", like uploaded files). */
export const ENTERED_MARK = ":entered:";

/** True for a workout the athlete entered by hand rather than uploaded or synced. */
export const isEnteredActivity = (a: Pick<Activity, "source">): boolean =>
  a.source.vendor === "manual" && a.source.externalId.includes(ENTERED_MARK);

/** Local "HH:MM" on a 24-hour clock. */
export const isStartTime = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
