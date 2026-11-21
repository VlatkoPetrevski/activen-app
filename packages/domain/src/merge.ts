import {
  canDisplay,
  canUseForAi,
  DEFAULT_SOURCE_PRIORITY,
  type Audience,
} from "./source-policy.js";
import { activityGroup } from "./sport.js";
import type { Activity, SourceRef, Vendor } from "./types.js";

/** Fields that may be filled from a secondary source when the primary source lacks them. */
export const MERGEABLE_FIELDS = [
  "distanceInMeters",
  "movingDurationInSeconds",
  "totalElevationGainInMeters",
  "trainingLoad",
  "averageHeartRateInBeatsPerMinute",
  "maxHeartRateInBeatsPerMinute",
  "averagePowerInWatts",
  "activeKilocalories",
  "gearName",
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export interface MergedActivity {
  /** The merged record; `id`, `source`, name, type, dates and elapsed time come from the primary. */
  activity: Activity;
  /** All sources that recorded this workout, primary first. */
  sources: SourceRef[];
  /** Stored ids of those source records, in the same order (details and check-ins hang on them). */
  sourceIds: string[];
  /** Which vendor each mergeable field value came from (absent when the value is null). */
  provenance: Partial<Record<MergeableField, Vendor>>;
}

export interface MergeOptions {
  /**
   * The athlete's source priority, most trusted first; unlisted vendors come last.
   * Defaults to {@link DEFAULT_SOURCE_PRIORITY} (device makers first, Strava last).
   */
  priority?: readonly Vendor[];
  /** Restricts input to sources that may be shown to this audience (default: owner). */
  audience?: Audience;
  /** Restricts input to sources whose terms allow AI processing. */
  forAi?: boolean;
  /** Max start-time difference for two records to be the same workout. Default 5 min. */
  startToleranceS?: number;
  /** Max relative difference of elapsed time. Default 0.15 (15 %). */
  durationTolerance?: number;
}

function startMs(a: Activity): number {
  return a.startTimeInSeconds * 1000;
}

type WorkoutKey = Pick<Activity, "activityType" | "startTimeInSeconds" | "durationInSeconds">;

/**
 * Whether two records describe the same workout, whatever their source: same sport group, start
 * within `startToleranceS` (default 5 min) and elapsed time within `durationTolerance` (15 %).
 * Used when merging sources and to refuse a second upload of a workout already imported.
 */
export function sameWorkout(
  a: WorkoutKey,
  b: WorkoutKey,
  options: { startToleranceS?: number; durationTolerance?: number } = {},
): boolean {
  const startTolS = options.startToleranceS ?? 300;
  const durTol = options.durationTolerance ?? 0.15;
  if (activityGroup(a.activityType) !== activityGroup(b.activityType)) return false;
  if (Math.abs(a.startTimeInSeconds - b.startTimeInSeconds) > startTolS) return false;
  const longer = Math.max(a.durationInSeconds, b.durationInSeconds);
  if (longer === 0) return true;
  return Math.abs(a.durationInSeconds - b.durationInSeconds) / longer <= durTol;
}

function isSameWorkout(a: Activity, b: Activity, startTolS: number, durTol: number): boolean {
  if (a.athleteId !== b.athleteId) return false;
  if (a.source.vendor === b.source.vendor) return false;
  return sameWorkout(a, b, { startToleranceS: startTolS, durationTolerance: durTol });
}

/**
 * De-duplicates the same workout recorded by several vendors (e.g. a Garmin activity that was also
 * auto-uploaded to Strava) and merges it using the athlete's source priority: the highest-priority
 * source is primary, and its missing values are filled from the next sources in priority order.
 *
 * Source policies are applied BEFORE merging, so a coach view or an AI input never contains any value
 * that originated from a source whose terms forbid it.
 */
export function mergeActivities(
  activities: readonly Activity[],
  options: MergeOptions = {},
): MergedActivity[] {
  const audience = options.audience ?? "owner";
  const startTolS = options.startToleranceS ?? 300;
  const durTol = options.durationTolerance ?? 0.15;
  const priority = options.priority ?? DEFAULT_SOURCE_PRIORITY;
  const rank = (v: Vendor): number => {
    const i = priority.indexOf(v);
    return i === -1 ? priority.length : i;
  };

  const eligible = activities
    .filter((a) => !a.deleted)
    .filter((a) => canDisplay(a.source.vendor, audience))
    .filter((a) => !options.forAi || canUseForAi(a.source.vendor))
    .sort((a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id));

  // Greedy clustering in start-time order; a record joins the first cluster that has no record from
  // the same vendor and matches every member.
  const clusters: Activity[][] = [];
  for (const a of eligible) {
    const target = clusters.find(
      (c) =>
        Math.abs(startMs(c[0] as Activity) - startMs(a)) <= startTolS * 1000 &&
        c.every((m) => isSameWorkout(m, a, startTolS, durTol)),
    );
    if (target) target.push(a);
    else clusters.push([a]);
  }

  return clusters.map((cluster) => {
    const ordered = [...cluster].sort(
      (a, b) => rank(a.source.vendor) - rank(b.source.vendor) || a.id.localeCompare(b.id),
    );
    const primary = ordered[0] as Activity;
    const merged: Activity = { ...primary };
    const provenance: Partial<Record<MergeableField, Vendor>> = {};

    for (const field of MERGEABLE_FIELDS) {
      const donor = ordered.find((m) => m[field] !== null);
      if (!donor) continue;
      // Each field keeps its own type; the cast is safe because donor and merged share `Activity`.
      (merged as unknown as Record<MergeableField, unknown>)[field] = donor[field];
      provenance[field] = donor.source.vendor;
    }
    merged.isRace = ordered.some((m) => m.isRace);

    return {
      activity: merged,
      sources: ordered.map((m) => m.source),
      sourceIds: ordered.map((m) => m.id),
      provenance,
    };
  });
}
