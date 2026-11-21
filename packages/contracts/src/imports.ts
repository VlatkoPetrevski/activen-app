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
  | { kind: "merged"; activity: Activity };

/**
 * What an uploaded workout is, given the athlete's activities that started near it. Shared by
 * the API and the demo, so both refuse and merge exactly the same files.
 */
export function importOutcome(parsed: WorkoutKey, nearby: readonly Activity[]): ImportOutcome {
  const same = nearby.filter((a) => !a.deleted && sameWorkout(a, parsed));
  const uploaded = same.find((a) => a.source.vendor === "manual");
  if (uploaded) return { kind: "duplicate", activity: uploaded };
  const app = same[0];
  return app ? { kind: "merged", activity: app } : { kind: "new" };
}
