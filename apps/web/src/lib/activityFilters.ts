import type { ActivityDto } from "@activen/contracts";
import {
  activityGroup,
  isActivityType,
  type ActivityGroup,
  type ActivityType,
  type UnitSystem,
} from "@activen/domain";

export type RunKind = "all" | "road" | "trail" | "treadmill" | "track";
/** Distance bands; edges depend on the unit system (5/10/21 km or 3/6/13 mi). */
export type DistanceBand = "any" | "short" | "medium" | "long" | "veryLong";
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

const MILE = 1609.344;
/** Band edges in the user's unit: race-like 5/10/21 km, or 3/6/13 mi for US units. */
export const DISTANCE_EDGES: Record<UnitSystem, readonly [number, number, number]> = {
  metric: [5, 10, 21],
  imperial: [3, 6, 13],
};

/** [from, to) in metres for a band. */
export function distanceBandRange(
  band: Exclude<DistanceBand, "any">,
  units: UnitSystem = "metric",
): [number, number] {
  const unit = units === "imperial" ? MILE : 1000;
  // The half marathon (21.1 km / 13.1 mi) belongs to the long band, so the top edge is +0.1.
  const [a, b, c] = DISTANCE_EDGES[units].map((v, i) => (i === 2 ? v + 0.1 : v) * unit) as [
    number,
    number,
    number,
  ];
  return {
    short: [0, a],
    medium: [a, b],
    long: [b, c],
    veryLong: [c, Number.POSITIVE_INFINITY],
  }[band] as [number, number];
}

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
  units: UnitSystem = "metric",
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
      const [lo, hi] = distanceBandRange(f.distance, units);
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
