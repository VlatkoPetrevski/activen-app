/**
 * Race goals and training paces.
 *
 * - Daniels–Gilbert VDOT ("Daniels' Running Formula"): oxygen cost of running at a velocity and
 *   the share of VO2max a runner can hold for a duration. A race result gives a VDOT. The VDOT
 *   predicts other race times and the training paces E / M / T / I / R.
 * - Riegel (T2 = T1 · (D2 / D1)^1.06) is a second, simpler prediction, shown as a cross-check.
 * - parseGoal reads a goal the way people write it: "маратон за 3:30", "HM 1:45", "10k под 45 мин".
 */
import type { StepTarget, WorkoutStep, WorkoutStructure } from "./workout.js";

export const RACE_DISTANCES = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
} as const;
export type RaceKey = keyof typeof RACE_DISTANCES;

/** Oxygen cost (ml/kg/min) of running at v metres per minute. */
const oxygenCost = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Share of VO2max that can be held for t minutes. */
const sustainable = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
/** Velocity (m/min) whose oxygen cost is `vo2` (the positive root of the quadratic). */
const velocityFor = (vo2: number) => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
};

/** VDOT of a race result. */
export function vdot(distanceMeters: number, seconds: number): number {
  const t = seconds / 60;
  return oxygenCost(distanceMeters / t) / sustainable(t);
}

/** Predicted time (s) for a distance at a VDOT (bisection on the monotonic formula). */
export function predictTime(vdotValue: number, distanceMeters: number): number {
  let lo = 60;
  let hi = 60 * 60 * 24;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distanceMeters, mid) > vdotValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Riegel's prediction from one result to another distance. */
export const riegel = (fromMeters: number, fromSeconds: number, toMeters: number): number =>
  fromSeconds * (toMeters / fromMeters) ** 1.06;

/** Seconds per km at a share of VO2max. */
const paceAt = (vdotValue: number, share: number) => 60_000 / velocityFor(vdotValue * share);

export type PaceKey = "E" | "M" | "HM" | "T" | "10K" | "5K" | "I" | "R";

export interface TrainingPaces {
  vdot: number;
  /** Predicted race times (s), by VDOT. */
  races: Record<RaceKey, number>;
  /** Seconds per km; E is a range (fast end first). */
  paces: { E: [number, number] } & Record<Exclude<PaceKey, "E">, number>;
}

/** Daniels' paces for a VDOT: race paces from predicted times, the rest from shares of VO2max. */
export function trainingPaces(vdotValue: number): TrainingPaces {
  const races = Object.fromEntries(
    Object.entries(RACE_DISTANCES).map(([k, d]) => [k, predictTime(vdotValue, d)]),
  ) as Record<RaceKey, number>;
  const perKm = (k: RaceKey) => races[k] / (RACE_DISTANCES[k] / 1000);
  return {
    vdot: vdotValue,
    races,
    paces: {
      E: [paceAt(vdotValue, 0.7), paceAt(vdotValue, 0.62)],
      M: perKm("marathon"),
      HM: perKm("half"),
      T: paceAt(vdotValue, 0.88),
      "10K": perKm("10k"),
      "5K": perKm("5k"),
      I: paceAt(vdotValue, 0.975),
      R: paceAt(vdotValue, 1.05),
    },
  };
}

export interface RaceGoal {
  race: RaceKey;
  distanceMeters: number;
  seconds: number;
}

const RACE_WORDS: [RaceKey, RegExp][] = [
  [
    "half",
    /полумаратон|полу-маратон|half(?:[- ]?marathon)?|(?<![\p{L}\d])hm(?![\p{L}])|21[.,]?1?\s*(?:k|km|км)/iu,
  ],
  ["marathon", /маратон|marathon|(?<![\p{L}\d])m(?![\p{L}])|42[.,]?2?\s*(?:k|km|км)/iu],
  ["10k", /(?<!\d)10\s*(?:k|km|км)(?![\p{L}])/iu],
  ["5k", /(?<!\d)5\s*(?:k|km|км)(?![\p{L}])/iu],
];

/**
 * Time in the goal: "3:30", "3:30:00", "3h30", "3ч 30", "45 мин", "45:00" (minutes for a 5k/10k,
 * hours for a half/marathon when only h:mm is written).
 */
function goalSeconds(text: string, race: RaceKey): number | null {
  const hms = /(\d{1,2}):([0-5]\d):([0-5]\d)/.exec(text);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const hm = /(\d{1,2})\s*(?:h|ч|час(?:а)?)\s*(\d{1,2})?/iu.exec(text);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2] ?? 0) * 60;
  const clock = /(\d{1,3}):([0-5]\d)/.exec(text);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    const long = race === "half" || race === "marathon";
    return long && a < 10 ? a * 3600 + b * 60 : a * 60 + b;
  }
  const min = /(\d{2,3})\s*(?:min|мин)/iu.exec(text);
  return min ? Number(min[1]) * 60 : null;
}

/** Reads a race goal from text, or null when there is no race and time in it. */
export function parseGoal(text: string): RaceGoal | null {
  const t = text.trim();
  for (const [race, re] of RACE_WORDS) {
    if (!re.test(t)) continue;
    // The race words may contain digits ("10k"): look for the time without them.
    const seconds = goalSeconds(t.replace(re, " "), race);
    if (!seconds) return null;
    const distanceMeters = RACE_DISTANCES[race];
    // Plausible: between world-record pace (~2:50/km) and walking (~12:00/km).
    const perKm = seconds / (distanceMeters / 1000);
    if (perKm < 170 || perKm > 720) return null;
    return { race, distanceMeters, seconds };
  }
  return null;
}

/** Paces for a goal: the VDOT of the goal result. */
export const goalPaces = (g: RaceGoal): TrainingPaces =>
  trainingPaces(vdot(g.distanceMeters, g.seconds));

const PACE_ALIASES: [PaceKey, RegExp][] = [
  [
    "HM",
    /^(?:hm|half(?:[- ]?marathon)?|полумаратон(?:ско)?|темпо за полумаратон)(?:\s*(?:pace|темпо))?$/iu,
  ],
  ["M", /^(?:m|mp|marathon|маратон(?:ско)?|темпо за маратон)(?:\s*(?:pace|темпо))?$/iu],
  ["T", /^(?:t|threshold|tempo|праг|темпо на праг)(?:\s*(?:pace|темпо))?$/iu],
  ["10K", /^10\s*(?:k|km|км)(?:\s*(?:pace|темпо))?$/iu],
  ["5K", /^5\s*(?:k|km|км)(?:\s*(?:pace|темпо))?$/iu],
  ["I", /^(?:i|interval|vo2|vo2max|интервал(?:но)?)(?:\s*(?:pace|темпо))?$/iu],
  ["R", /^(?:r|repetition|reps|брзо)(?:\s*(?:pace|темпо))?$/iu],
  ["E", /^(?:e|easy|лесно)(?:\s*(?:pace|темпо))?$/iu],
];

/** Which training pace a named effort means ("M pace", "5K темпо", "праг"), or null. */
export function paceKeyOf(label: string): PaceKey | null {
  const t = label.trim().replace(/\s+/g, " ");
  return PACE_ALIASES.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** A named effort as a pace range (±5 s), or null when it names no pace or there is no goal. */
export function resolvePace(
  label: string,
  paces: TrainingPaces | null,
): { key: PaceKey; low: number; high: number } | null {
  const key = paceKeyOf(label);
  if (!key || !paces) return null;
  if (key === "E")
    return { key, low: Math.round(paces.paces.E[0]), high: Math.round(paces.paces.E[1]) };
  const v = paces.paces[key];
  return { key, low: Math.round(v - 5), high: Math.round(v + 5) };
}

/** A step's target pace in s/km: a written pace, a named pace from the goal, or null. */
export function stepPace(target: StepTarget, paces: TrainingPaces | null): [number, number] | null {
  if (target.type === "pace") return [target.low, target.high];
  if (target.type === "label") {
    const p = resolvePace(target.text, paces);
    return p ? [p.low, p.high] : null;
  }
  return null;
}

/** Easy pace for warm-up, recovery and cool-down: the goal's E pace, else 6:00/km. */
const easyPace = (paces: TrainingPaces | null) =>
  paces ? (paces.paces.E[0] + paces.paces.E[1]) / 2 : 360;

export interface WorkoutTotals {
  meters: number;
  seconds: number;
  /** True when a part had no pace and was counted at an easy pace (or a time had no distance). */
  estimated: boolean;
}

/**
 * Total distance and time of a structured workout, as the planned distance and duration. Distance
 * steps take their time from the target pace (written, or named from the goal), else an easy
 * pace; time steps take their distance the same way. The last recovery of a repeat is not run.
 */
export function workoutTotals(s: WorkoutStructure, paces: TrainingPaces | null): WorkoutTotals {
  let meters = 0;
  let seconds = 0;
  let estimated = false;
  const add = (step: WorkoutStep) => {
    const p = stepPace(step.target, paces);
    const pace = p ? (p[0] + p[1]) / 2 : easyPace(paces);
    if (!p && step.intensity === "active") estimated = true;
    if (step.duration.type === "distance") {
      meters += step.duration.meters;
      seconds += (step.duration.meters / 1000) * pace;
    } else if (step.duration.type === "time") {
      seconds += step.duration.seconds;
      meters += (step.duration.seconds / pace) * 1000;
      if (!p) estimated = true;
    } else estimated = true;
  };
  for (const item of s.items) {
    if (item.kind === "step") add(item);
    else
      for (let n = 0; n < item.count; n++)
        for (const step of item.steps)
          if (!(n === item.count - 1 && step.intensity === "recovery")) add(step);
  }
  return { meters: Math.round(meters), seconds: Math.round(seconds), estimated };
}

const ZONE_OF_PACE: Record<PaceKey, 1 | 2 | 3 | 4 | 5> = {
  E: 2,
  M: 3,
  HM: 3,
  T: 4,
  "10K": 4,
  "5K": 5,
  I: 5,
  R: 5,
};

/** The heart-rate zone a step is meant for (to color it): its zone, its named pace, or its role. */
export function stepZone(step: WorkoutStep, paces: TrainingPaces | null): 1 | 2 | 3 | 4 | 5 {
  const t = step.target;
  if (t.type === "hr_zone") return Math.min(5, Math.max(1, t.zone)) as 1 | 2 | 3 | 4 | 5;
  if (t.type === "label") {
    const key = paceKeyOf(t.text);
    if (key) return ZONE_OF_PACE[key];
  }
  if (t.type === "pace" && paces) {
    const v = (t.low + t.high) / 2;
    const p = paces.paces;
    // The closest named pace, by the goal's numbers.
    const keys = (Object.keys(ZONE_OF_PACE) as PaceKey[]).filter((k) => k !== "E");
    const nearest = keys.reduce((best, k) =>
      Math.abs(p[k as Exclude<PaceKey, "E">] - v) < Math.abs(p[best as Exclude<PaceKey, "E">] - v)
        ? k
        : best,
    );
    return v >= p.E[0] - 5 ? 2 : ZONE_OF_PACE[nearest];
  }
  if (t.type === "pace") return 4;
  return step.intensity === "active" ? 2 : 1;
}

export interface WorkoutBlock {
  intensity: WorkoutStep["intensity"];
  zone: 1 | 2 | 3 | 4 | 5;
  seconds: number;
}

/** The workout as blocks in order (repeats expanded), each with its zone and estimated time. */
export function workoutBlocks(s: WorkoutStructure, paces: TrainingPaces | null): WorkoutBlock[] {
  const blocks: WorkoutBlock[] = [];
  const push = (step: WorkoutStep) => {
    const t = workoutTotals({ items: [step], source: s.source }, paces);
    blocks.push({ intensity: step.intensity, zone: stepZone(step, paces), seconds: t.seconds });
  };
  for (const item of s.items) {
    if (item.kind === "step") push(item);
    else
      for (let n = 0; n < item.count; n++)
        for (const step of item.steps)
          if (!(n === item.count - 1 && step.intensity === "recovery")) push(step);
  }
  return blocks;
}
