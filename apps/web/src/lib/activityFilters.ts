import type { ActivityDto } from "@activen/contracts";
import {
  activityGroup,
  isActivityType,
  type ActivityGroup,
  type ActivityType,
} from "@activen/domain";

export type RunKind = "all" | "road" | "trail" | "treadmill" | "track";
export type DistanceBand = "any" | "lt5" | "5to10" | "10to21" | "21plus";
export type DurationBand = "any" | "lt30" | "30to60" | "60to120" | "120plus";
export type CheckInState = "any" | "rated" | "unrated" | "hard";
export type SortKey = "newest" | "longest" | "fastest" | "hardest" | "load";

export interface ActivityListFilter {
  /** Days back from today (inclusive). */
  period: number;
  group: ActivityGroup | "all";
  run: RunKind;
  distance: DistanceBand;
  duration: DurationBand;
  checkIn: CheckInState;
  sort: SortKey;
  query: string;
}

export const DEFAULT_FILTER: ActivityListFilter = {
  period: 28,
  group: "all",
  run: "all",
  distance: "any",
  duration: "any",
  checkIn: "any",
  sort: "newest",
  query: "",
};

export const PERIODS = [7, 28, 91, 182, 365] as const;

const RUN_TYPES: Record<Exclude<RunKind, "all">, ActivityType[]> = {
  road: ["RUNNING"],
  trail: ["TRAIL_RUNNING"],
  treadmill: ["TREADMILL_RUNNING", "VIRTUAL_RUN"],
  track: ["TRACK_RUNNING"],
};

const DISTANCE: Record<Exclude<DistanceBand, "any">, [number, number]> = {
  lt5: [0, 5000],
  "5to10": [5000, 10000],
  "10to21": [10000, 21100],
  "21plus": [21100, Number.POSITIVE_INFINITY],
};

const DURATION: Record<Exclude<DurationBand, "any">, [number, number]> = {
  lt30: [0, 1800],
  "30to60": [1800, 3600],
  "60to120": [3600, 7200],
  "120plus": [7200, Number.POSITIVE_INFINITY],
};

const groupOf = (a: ActivityDto): ActivityGroup | "other" =>
  isActivityType(a.activityType) ? activityGroup(a.activityType) : "other";

const pace = (a: ActivityDto) =>
  a.distanceInMeters && a.durationInSeconds && a.distanceInMeters > 500
    ? a.durationInSeconds / a.distanceInMeters
    : Number.POSITIVE_INFINITY;

/** How many filters differ from the defaults (period and sort excluded) — for the badge. */
export function activeFilterCount(f: ActivityListFilter): number {
  return (
    (f.group !== "all" ? 1 : 0) +
    (f.run !== "all" ? 1 : 0) +
    (f.distance !== "any" ? 1 : 0) +
    (f.duration !== "any" ? 1 : 0) +
    (f.checkIn !== "any" ? 1 : 0) +
    (f.query.trim() ? 1 : 0)
  );
}

/** Applies the list filter and sort (the date range is applied by the query). */
export function applyActivityFilter(
  list: readonly ActivityDto[],
  f: ActivityListFilter,
): ActivityDto[] {
  const q = f.query.trim().toLowerCase();
  const out = list.filter((a) => {
    if (f.group !== "all" && groupOf(a) !== f.group) return false;
    if (
      f.group === "running" &&
      f.run !== "all" &&
      !RUN_TYPES[f.run].includes(a.activityType as ActivityType)
    )
      return false;
    if (f.distance !== "any") {
      const [lo, hi] = DISTANCE[f.distance];
      const d = a.distanceInMeters ?? 0;
      if (d < lo || d >= hi) return false;
    }
    if (f.duration !== "any") {
      const [lo, hi] = DURATION[f.duration];
      const s = a.durationInSeconds ?? 0;
      if (s < lo || s >= hi) return false;
    }
    const rpe = a.feedback?.perceivedEffort ?? null;
    if (f.checkIn === "rated" && !a.feedback) return false;
    if (f.checkIn === "unrated" && a.feedback) return false;
    if (f.checkIn === "hard" && (rpe ?? 0) < 7) return false;
    if (
      q &&
      !`${a.activityName ?? ""} ${a.gearName ?? ""} ${a.feedback?.comment ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  const by: Record<SortKey, (a: ActivityDto, b: ActivityDto) => number> = {
    newest: (a, b) => b.startTimeInSeconds - a.startTimeInSeconds,
    longest: (a, b) =>
      (b.distanceInMeters ?? 0) - (a.distanceInMeters ?? 0) ||
      (b.durationInSeconds ?? 0) - (a.durationInSeconds ?? 0),
    fastest: (a, b) => pace(a) - pace(b),
    hardest: (a, b) => (b.feedback?.perceivedEffort ?? 0) - (a.feedback?.perceivedEffort ?? 0),
    load: (a, b) => (b.trainingLoad ?? 0) - (a.trainingLoad ?? 0),
  };
  return out.sort((a, b) => by[f.sort](a, b) || b.startTimeInSeconds - a.startTimeInSeconds);
}

/** Totals for the summary line. */
export function totals(list: readonly ActivityDto[]) {
  return {
    count: list.length,
    distanceInMeters: list.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0),
    durationInSeconds: list.reduce((s, a) => s + (a.durationInSeconds ?? 0), 0),
  };
}
