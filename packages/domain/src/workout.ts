/**
 * Structured workouts (Garmin Training API model: steps with intensity, duration and target;
 * repeat blocks) and a deterministic parser for the way coaches write them:
 *
 *   "12 km фартлек 10 × 1 мин брзо / 1 мин лесно"
 *   "14 km with 6 × 1000 m at 5K pace, 2 min rest"
 *   "Загревање 3 km, 4 × 2 km на 4:00/km, одмор 400 m, смирување 2 km"
 *   "10 km лесно (Zone 2)"
 *
 * The coach's text stays the source of truth; a structure is an addition the coach accepts.
 */

export type StepIntensity = "warmup" | "active" | "recovery" | "rest" | "cooldown";

export type StepDuration =
  { type: "distance"; meters: number } | { type: "time"; seconds: number } | { type: "open" };

export type StepTarget =
  | { type: "none" }
  /** Seconds per kilometre, low = faster bound. */
  | { type: "pace"; low: number; high: number }
  | { type: "hr_zone"; zone: number }
  /** A named effort from the plan text ("5K темпо", "marathon pace"), resolved later. */
  | { type: "label"; text: string };

export interface WorkoutStep {
  kind: "step";
  intensity: StepIntensity;
  duration: StepDuration;
  target: StepTarget;
}

export interface WorkoutRepeat {
  kind: "repeat";
  count: number;
  steps: WorkoutStep[];
}

export type WorkoutItem = WorkoutStep | WorkoutRepeat;

export interface WorkoutStructure {
  items: WorkoutItem[];
  /** Who produced it: the rule-based parser, an AI suggestion, or the coach by hand. */
  source: "parser" | "ai" | "manual";
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(km|км|mi|m|м|min|мин|sec|сек|s|h|ч)(?![\p{L}])`;
const num = (s: string | undefined) => Number((s ?? "0").replace(",", "."));

function duration(value: number, unit: string): StepDuration {
  switch (unit.toLowerCase()) {
    case "km":
    case "км":
      return { type: "distance", meters: Math.round(value * 1000) };
    case "mi":
      return { type: "distance", meters: Math.round(value * 1609.344) };
    case "m":
    case "м":
      return { type: "distance", meters: Math.round(value) };
    case "h":
    case "ч":
      return { type: "time", seconds: Math.round(value * 3600) };
    case "sec":
    case "сек":
    case "s":
      return { type: "time", seconds: Math.round(value) };
    default:
      return { type: "time", seconds: Math.round(value * 60) };
  }
}

const clock = (m: string, s: string) => Number(m) * 60 + Number(s);
/** Plausible running paces (1:30–20:00 per km); anything else is not read as a pace. */
const MIN_PACE = 90;
const MAX_PACE = 1200;
const isPace = (v: number) => v >= MIN_PACE && v <= MAX_PACE;

/** Pace ("4:00/km", "3:55–4:05"), heart-rate zone ("Z2", "зона 3") or a named effort. */
export function parseTarget(text: string): StepTarget {
  const range = /(\d{1,2}):([0-5]\d)\s*[-–]\s*(\d{1,2}):([0-5]\d)/.exec(text);
  if (range) {
    const a = clock(range[1] ?? "0", range[2] ?? "0");
    const b = clock(range[3] ?? "0", range[4] ?? "0");
    // Written either way round ("4:05–3:55"); low is always the faster end.
    if (isPace(a) && isPace(b)) return { type: "pace", low: Math.min(a, b), high: Math.max(a, b) };
  }
  const pace = /(\d{1,2}):([0-5]\d)\s*(?:\/\s*(?:km|км))?/.exec(text);
  if (pace) {
    const v = clock(pace[1] ?? "0", pace[2] ?? "0");
    if (isPace(v))
      return {
        type: "pace",
        low: Math.max(MIN_PACE, v - 5),
        high: Math.min(MAX_PACE, v + 5),
      };
  }
  const zone = /(?:\bz|zone\s*|зона\s*)([1-5])\b/iu.exec(text);
  if (zone) return { type: "hr_zone", zone: Number(zone[1]) };
  const label =
    // JavaScript's \b is ASCII-only: Unicode letter lookarounds work for Cyrillic too.
    /(?<!\p{L})(?:на|at|@)\s+([^,;/()]+?)(?=\s*(?:[,;/()]|$|(?<!\p{L})(?:одмор|пауза|rest|со|with)(?!\p{L})))/iu.exec(
      text,
    );
  if (label?.[1]) return { type: "label", text: label[1].trim() };
  return { type: "none" };
}

function find(text: string, words: string): { duration: StepDuration; at: number } | null {
  const re = new RegExp(String.raw`(?:${words})\s*:?\s*${NUM}\s*${UNIT}`, "iu");
  const m = re.exec(text);
  if (m) return { duration: duration(num(m[1]), m[2] ?? "km"), at: m.index };
  const after = new RegExp(String.raw`${NUM}\s*${UNIT}\s*(?:${words})`, "iu").exec(text);
  return after ? { duration: duration(num(after[1]), after[2] ?? "km"), at: after.index } : null;
}

const WARMUP = String.raw`загревање|загрев|warm[- ]?up|wu`;
const COOLDOWN = String.raw`смирување|истрчување|cool[- ]?down|cd`;
const RECOVERY = String.raw`одмор|пауза|опоравување|rest|recovery|jog`;
const EASY = /лесно|easy|zone\s*[12]|z[12]\b|зона\s*[12]|опоравувачко|recovery run/iu;

/** Rough length of a step in metres (time at an easy 6:00/km) to fill the cool-down. */
function approxMeters(d: StepDuration, fast = false): number {
  if (d.type === "distance") return d.meters;
  if (d.type === "time") return (d.seconds / (fast ? 240 : 360)) * 1000;
  return 0;
}

/**
 * Parses a plan text into a structure, or null when there is nothing structured in it
 * (a rest day, a free-form note). Never invents numbers that are not in the text, except the
 * customary 2 km warm-up and the cool-down that completes a stated total distance.
 */
export function parseWorkout(text: string): WorkoutStructure | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const items: WorkoutItem[] = [];
  const total = new RegExp(String.raw`^${NUM}\s*(km|км|mi)(?![\p{L}])`, "iu").exec(t);
  const totalMeters = total ? approxMeters(duration(num(total[1]), total[2] ?? "km")) : null;

  const rep = new RegExp(String.raw`(\d+)\s*[×xх*]\s*${NUM}\s*${UNIT}(.*)`, "iu").exec(t);

  if (rep) {
    const count = Number(rep[1]);
    const work = duration(num(rep[2]), rep[3] ?? "m");
    const tail = rep[4] ?? "";
    // Recovery: "/ 1 мин лесно" or "одмор 2 мин" / "2 min rest".
    const slash = new RegExp(String.raw`^[^/]*/\s*${NUM}\s*${UNIT}`, "iu").exec(tail);
    const rec = slash
      ? { duration: duration(num(slash[1]), slash[2] ?? "min") }
      : find(tail, RECOVERY);
    const beforeRecovery =
      tail.split(/\/|(?<!\p{L})(?:одмор|пауза|rest|recovery)(?!\p{L})/iu)[0] ?? "";
    const target = parseTarget(beforeRecovery);

    const warm = find(t.slice(0, rep.index), WARMUP);
    const cool = find(tail, COOLDOWN) ?? find(t.slice(0, rep.index), COOLDOWN);
    const warmDuration: StepDuration = warm?.duration ?? { type: "distance", meters: 2000 };
    items.push({
      kind: "step",
      intensity: "warmup",
      duration: warmDuration,
      target: { type: "none" },
    });

    const steps: WorkoutStep[] = [{ kind: "step", intensity: "active", duration: work, target }];
    if (rec)
      steps.push({
        kind: "step",
        intensity: "recovery",
        duration: rec.duration,
        target: { type: "none" },
      });
    items.push({ kind: "repeat", count, steps });

    let coolDuration: StepDuration | null = cool?.duration ?? null;
    if (!coolDuration && totalMeters) {
      const used =
        approxMeters(warmDuration) +
        count * approxMeters(work, true) +
        (rec ? (count - 1) * approxMeters(rec.duration) : 0);
      const rest = Math.round((totalMeters - used) / 100) * 100;
      if (rest >= 500) coolDuration = { type: "distance", meters: rest };
    }
    items.push({
      kind: "step",
      intensity: "cooldown",
      duration: coolDuration ?? { type: "distance", meters: 1000 },
      target: { type: "none" },
    });
    return { items, source: "parser" };
  }

  // One continuous effort: "10 km лесно (Zone 2)", "Велосипед 60 мин лесно", "Long run 28 km".
  const single = new RegExp(String.raw`${NUM}\s*${UNIT}`, "iu").exec(t);
  if (single) {
    const d = duration(num(single[1]), single[2] ?? "km");
    const target = parseTarget(t);
    items.push({
      kind: "step",
      intensity: "active",
      duration: d,
      target: target.type === "none" && EASY.test(t) ? { type: "hr_zone", zone: 2 } : target,
    });
    return { items, source: "parser" };
  }
  return null;
}

/** Steps in order, repeats expanded (for comparing with laps). */
export function flattenWorkout(s: WorkoutStructure): WorkoutStep[] {
  return s.items.flatMap((i) =>
    i.kind === "step"
      ? [i]
      : Array.from({ length: i.count }, (_, n) =>
          n === i.count - 1 ? i.steps.filter((x) => x.intensity !== "recovery") : i.steps,
        ).flat(),
  );
}
