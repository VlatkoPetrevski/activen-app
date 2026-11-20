/**
 * Deterministic demo training block (marathon preparation): plan, activities, check-ins and
 * morning wellness. Used by the web demo mode and by the local seed script, so screens can be
 * reviewed with realistic data before devices are connected. Not used in production flows.
 */
import {
  addDays,
  weekStart,
  weekdayIndex,
  type ActivityType,
  type LocalDate,
  type Vendor,
} from "@activen/domain";
import type {
  ActivityDeviceDto,
  ActivityLapDto,
  ExerciseDto,
  LapIntensity,
  RouteDto,
  WeatherDto,
  WellnessDto,
} from "./responses.js";

export type DemoLocale = "mk" | "en";

export interface DemoPlanEntry {
  key: string;
  calendarDate: LocalDate;
  kind: "workout" | "rest";
  description: string;
  plannedActivityType: ActivityType | null;
  plannedDistanceInMeters: number | null;
  plannedDurationInSeconds: number | null;
  notes: string | null;
  sequence: number;
}

export interface DemoActivity {
  vendor: Vendor;
  externalId: string;
  activityName: string;
  activityType: ActivityType;
  calendarDate: LocalDate;
  startTimeInSeconds: number;
  startTimeOffsetInSeconds: number;
  distanceInMeters: number | null;
  durationInSeconds: number;
  movingDurationInSeconds: number;
  totalElevationGainInMeters: number | null;
  trainingLoad: number;
  averageHeartRateInBeatsPerMinute: number;
  maxHeartRateInBeatsPerMinute: number;
  averagePowerInWatts: number | null;
  activeKilocalories: number;
  gearName: string | null;
  isRace: boolean;
}

export interface DemoFeedback {
  externalId: string;
  perceivedEffort: number;
  feel: number;
  comment: string | null;
}

export interface DemoTraining {
  planEntries: DemoPlanEntry[];
  activities: DemoActivity[];
  feedback: DemoFeedback[];
  wellness: WellnessDto[];
}

export interface DemoOptions {
  /** Athlete-local "today": past days have activities, today and later only the plan. */
  today: LocalDate;
  weeksBack?: number;
  weeksAhead?: number;
  locale?: DemoLocale;
  seed?: number;
  /** Share of planned sessions that are skipped (0–1). */
  skipRate?: number;
  /** Adds the heavy-legs check-in on the last easy day (a coach signal). Default true. */
  heavyDay?: boolean;
  /** Rotates the weekly pattern by this many days (athletes train on different days). */
  weekShift?: number;
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (min: number, max: number) => min + (max - min) * next(),
    int: (min: number, max: number) => Math.floor(min + (max - min + 1) * next()),
  };
}

const TEXT = {
  mk: {
    rest: "Одмор",
    easy: (km: number) => `${km} km лесно (Zone 2)`,
    recovery: (km: number) => `${km} km опоравувачко`,
    long: (km: number) => `Долго трчање ${km} km`,
    strength: "Сила · 45 мин (кор и нозе)",
    bike: "Велосипед 60 мин лесно",
    quality: [
      "14 km со 6 × 1000 м на 5K темпо",
      "15 km со 3 × 3 km на маратонско темпо",
      "12 km фартлек 10 × 1 мин брзо / 1 мин лесно",
    ],
    qualityNote:
      "Првите два интервали малку побавно, па држи го темпото. Ако пулсот оди над 175 — скрати на 5.",
    longNote: "Последните 5 km на маратонско темпо ако се чувствуваш добро. Пиј на секои 5 km.",
    run: "Скопје — трчање",
    bikeName: "Скопје — велосипед",
    strengthName: "Сила",
    heavyLegs: "Нозете тешки од почеток.",
    goodDay: "Одлично се чувствував, темпото беше лесно.",
    knee: "Левото колено малку чувствително на крајот.",
  },
  en: {
    rest: "Rest",
    easy: (km: number) => `${km} km easy (Zone 2)`,
    recovery: (km: number) => `${km} km recovery`,
    long: (km: number) => `Long run ${km} km`,
    strength: "Strength · 45 min (core and legs)",
    bike: "Bike 60 min easy",
    quality: [
      "14 km with 6 × 1000 m at 5K pace",
      "15 km with 3 × 3 km at marathon pace",
      "12 km fartlek 10 × 1 min hard / 1 min easy",
    ],
    qualityNote:
      "Take the first two intervals a little slower, then hold the pace. If HR goes above 175, cut to 5.",
    longNote: "Last 5 km at marathon pace if you feel good. Drink every 5 km.",
    run: "Skopje Running",
    bikeName: "Skopje Cycling",
    strengthName: "Strength",
    heavyLegs: "Legs heavy from the start.",
    goodDay: "Felt great, the pace was easy.",
    knee: "Left knee a little sensitive at the end.",
  },
} as const;

/** Long-run distances per week of the block (km), with a lighter week every fourth week. */
const LONG_RUN_KM = [16, 18, 20, 14, 22, 24, 18, 26, 28, 20, 30, 16, 12];

type Session = "rest" | "quality" | "easy" | "strength" | "long" | "recovery" | "bike";
const WEEK: Session[] = ["rest", "quality", "easy", "strength", "rest", "long", "recovery"];

const PROFILE: Record<
  Exclude<Session, "rest">,
  { pace: number; hr: number; load: number; hour: number }
> = {
  quality: { pace: 292, hr: 158, load: 145, hour: 18 },
  easy: { pace: 332, hr: 141, load: 72, hour: 7 },
  strength: { pace: 0, hr: 112, load: 38, hour: 19 },
  long: { pace: 318, hr: 147, load: 190, hour: 8 },
  recovery: { pace: 348, hr: 133, load: 45, hour: 9 },
  bike: { pace: 0, hr: 125, load: 62, hour: 10 },
};

const OFFSET_SECONDS = 3600; // Europe/Skopje in winter

function epochSeconds(date: LocalDate, hour: number): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, hour) / 1000 - OFFSET_SECONDS;
}

export function buildDemoTraining(options: DemoOptions): DemoTraining {
  const {
    today,
    weeksBack = 8,
    weeksAhead = 2,
    locale = "mk",
    seed = 7,
    skipRate = 0.12,
    heavyDay = true,
    weekShift = 0,
  } = options;
  const shift = ((weekShift % 7) + 7) % 7;
  const sessionOn = (date: LocalDate): Session =>
    WEEK[(weekdayIndex(date) + 7 - shift) % 7] ?? "rest";
  // The most recent easy day before today gets a heavy-legs check-in: a coach signal.
  let heavyDate: LocalDate | null = null;
  if (heavyDay) {
    let d = addDays(today, -1);
    for (let i = 0; i < 7 && !heavyDate; i++, d = addDays(d, -1))
      if (sessionOn(d) === "easy") heavyDate = d;
  }
  const t = TEXT[locale];
  const r = rng(seed);
  const firstMonday = addDays(weekStart(today), -7 * weeksBack);
  const days = 7 * (weeksBack + weeksAhead + 1);

  const planEntries: DemoPlanEntry[] = [];
  const activities: DemoActivity[] = [];
  const feedback: DemoFeedback[] = [];
  const wellness: WellnessDto[] = [];
  let lastLoad = 0;

  for (let i = 0; i < days; i++) {
    const date = addDays(firstMonday, i);
    const week = Math.floor(i / 7);
    let session: Session = sessionOn(date);
    if (session === "recovery" && week % 2 === 1) session = "bike";
    const longKm = LONG_RUN_KM[week % LONG_RUN_KM.length] ?? 20;
    const quality = t.quality[week % t.quality.length] ?? t.quality[0];

    const plan = ((): Omit<DemoPlanEntry, "key" | "calendarDate" | "sequence"> => {
      switch (session) {
        case "rest":
          return {
            kind: "rest",
            description: t.rest,
            plannedActivityType: null,
            plannedDistanceInMeters: null,
            plannedDurationInSeconds: null,
            notes: null,
          };
        case "quality":
          return {
            kind: "workout",
            description: quality,
            plannedActivityType: "RUNNING",
            plannedDistanceInMeters: quality.startsWith("15")
              ? 15_000
              : quality.startsWith("12")
                ? 12_000
                : 14_000,
            plannedDurationInSeconds: 4500,
            notes: t.qualityNote,
          };
        case "easy":
          return {
            kind: "workout",
            description: t.easy(10),
            plannedActivityType: "RUNNING",
            plannedDistanceInMeters: 10_000,
            plannedDurationInSeconds: 3300,
            notes: null,
          };
        case "strength":
          return {
            kind: "workout",
            description: t.strength,
            plannedActivityType: "STRENGTH_TRAINING",
            plannedDistanceInMeters: null,
            plannedDurationInSeconds: 2700,
            notes: null,
          };
        case "long":
          return {
            kind: "workout",
            description: t.long(longKm),
            plannedActivityType: "RUNNING",
            plannedDistanceInMeters: longKm * 1000,
            plannedDurationInSeconds: longKm * 318,
            notes: t.longNote,
          };
        case "recovery":
          return {
            kind: "workout",
            description: t.recovery(8),
            plannedActivityType: "RUNNING",
            plannedDistanceInMeters: 8000,
            plannedDurationInSeconds: 2800,
            notes: null,
          };
        case "bike":
          return {
            kind: "workout",
            description: t.bike,
            plannedActivityType: "CYCLING",
            plannedDistanceInMeters: null,
            plannedDurationInSeconds: 3600,
            notes: null,
          };
      }
    })();
    planEntries.push({ key: `plan-${date}`, calendarDate: date, sequence: 0, ...plan });

    const skipped = r.next() < skipRate && date !== heavyDate;
    if (date < today && session !== "rest" && !skipped) {
      const p = PROFILE[session];
      const externalId = `demo-${date}`;
      const hr = Math.round(p.hr + r.between(-4, 4));
      const isRun = session !== "strength" && session !== "bike";
      const distance = isRun
        ? Math.round((plan.plannedDistanceInMeters ?? 0) * r.between(0.97, 1.05))
        : session === "bike"
          ? Math.round(r.between(24, 30) * 1000)
          : null;
      const duration = isRun
        ? Math.round(((distance ?? 0) / 1000) * (p.pace + r.between(-8, 10)) + 30)
        : Math.round((plan.plannedDurationInSeconds ?? 3600) * r.between(0.95, 1.08));
      const load = Math.round(
        p.load * r.between(0.85, 1.15) * (session === "long" ? longKm / 22 : 1),
      );
      lastLoad = load;
      activities.push({
        vendor: "garmin",
        externalId,
        activityName:
          session === "bike" ? t.bikeName : session === "strength" ? t.strengthName : t.run,
        activityType:
          session === "bike" ? "CYCLING" : session === "strength" ? "STRENGTH_TRAINING" : "RUNNING",
        calendarDate: date,
        startTimeInSeconds: epochSeconds(date, p.hour),
        startTimeOffsetInSeconds: OFFSET_SECONDS,
        distanceInMeters: distance,
        durationInSeconds: duration,
        movingDurationInSeconds: Math.round(duration * (isRun ? 0.985 : 0.9)),
        totalElevationGainInMeters:
          isRun || session === "bike" ? Math.round(r.between(35, 160)) : null,
        trainingLoad: load,
        averageHeartRateInBeatsPerMinute: hr,
        maxHeartRateInBeatsPerMinute: hr + r.int(12, 24),
        averagePowerInWatts: isRun
          ? Math.round(r.between(250, 300))
          : session === "bike"
            ? Math.round(r.between(150, 185))
            : null,
        activeKilocalories: Math.round(isRun ? ((distance ?? 0) / 1000) * 68 : (duration / 60) * 7),
        gearName: isRun ? "Adidas Adizero Boston 13" : null,
        isRace: false,
      });

      if (r.next() < 0.75 || date === heavyDate) {
        const base: Record<Exclude<Session, "rest">, [number, number]> = {
          quality: [7, 8],
          easy: [3, 4],
          strength: [5, 6],
          long: [6, 7],
          recovery: [2, 3],
          bike: [3, 4],
        };
        const [lo, hi] = base[session];
        const heavy = date === heavyDate;
        const rpe = heavy ? 9 : r.int(lo, hi);
        const comment = heavy
          ? t.heavyLegs
          : session === "long" && week === weeksBack - 2
            ? t.knee
            : r.next() < 0.15
              ? t.goodDay
              : null;
        feedback.push({ externalId, perceivedEffort: rpe, feel: heavy ? 2 : r.int(3, 4), comment });
      }
    }

    if (date <= today) {
      const afterHardDay = lastLoad > 140;
      const readiness = Math.round(
        Math.min(95, Math.max(25, r.between(58, 82) - (afterHardDay ? 18 : 0))),
      );
      const unbalanced = r.next() < 0.1;
      wellness.push({
        calendarDate: date,
        trainingReadiness: date === today ? 72 : readiness,
        hrvStatus: date === today ? "balanced" : unbalanced ? "unbalanced" : "balanced",
        lastNightHrvMs: date === today ? 62 : Math.round(r.between(54, 68) - (unbalanced ? 8 : 0)),
        sleepScore: date === today ? 81 : Math.round(r.between(64, 89)),
        sleepDurationInSeconds: date === today ? 26_640 : Math.round(r.between(6.2, 8.1) * 3600),
        restingHeartRate: date === today ? 48 : Math.round(r.between(46, 52)),
        recoveryTimeInMinutes:
          date === today
            ? 120
            : Math.round(afterHardDay ? r.between(900, 1800) : r.between(0, 600)),
      });
      lastLoad = 0;
    }
  }
  return { planEntries, activities, feedback, wellness };
}

/**
 * Demo weather: a typical November day in Skopje — cold morning with poor air (heating season),
 * clearing up and warming to the early afternoon.
 */
export function buildDemoWeather(seed = 3): WeatherDto {
  const r = rng(seed);
  const min = Math.round(r.between(1, 4));
  const max = Math.round(r.between(11, 14));
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    // Coldest around 06:00, warmest around 14:00.
    const phase = Math.cos(((hour - 14) / 24) * 2 * Math.PI);
    const temperature = Math.round((min + ((max - min) * (phase + 1)) / 2) * 10) / 10;
    const morningSmog = hour >= 6 && hour <= 10 ? 30 : hour >= 18 ? 20 : 0;
    return {
      hour,
      temperature,
      precipitationProbability:
        hour >= 19 ? Math.round(r.between(10, 30)) : Math.round(r.between(0, 8)),
      weatherCode: hour < 8 ? 45 : hour < 11 ? 2 : hour < 17 ? 1 : 3,
      europeanAqi: Math.round(r.between(38, 48) + morningSmog),
    };
  });
  const now = hourly[8] ?? { temperature: 6, europeanAqi: 60 };
  return {
    location: { name: "Скопје", latitude: 41.9981, longitude: 21.4254 },
    current: {
      temperature: now.temperature,
      apparentTemperature: Math.round((now.temperature - 2) * 10) / 10,
      weatherCode: 2,
      isDay: true,
      windSpeedKmh: Math.round(r.between(6, 12)),
    },
    today: {
      min,
      max,
      sunrise: "06:52",
      sunset: "16:13",
      uvIndexMax: 2,
      precipitationProbabilityMax: Math.max(...hourly.map((h) => h.precipitationProbability ?? 0)),
    },
    hourly,
    airQuality: { europeanAqi: now.europeanAqi ?? 60, pm2_5: 38, pm10: 52 },
  };
}

type LL = [number, number];

/** The Vardar through Skopje, west to east (approximate), used as the demo's river line. */
export const DEMO_VARDAR: LL[] = [
  [41.9905, 21.33],
  [41.9985, 21.355],
  [42.0055, 21.38],
  [42.005, 21.4],
  [42.0028, 21.41],
  [42.001, 21.417],
  [41.9985, 21.428],
  [41.9976, 21.4337],
  [41.996, 21.443],
  [41.9935, 21.456],
  [41.9895, 21.472],
  [41.986, 21.49],
];
const BRIDGE = 7; // Stone Bridge, index in DEMO_VARDAR

/** City Park (Градски парк), north of the river, west of the centre — perimeter path. */
const CITY_PARK: LL[] = [
  [42.0036, 21.4178],
  [42.0062, 21.4196],
  [42.0091, 21.4162],
  [42.0104, 21.4098],
  [42.0097, 21.4036],
  [42.0071, 21.4012],
  [42.0047, 21.4041],
  [42.0034, 21.4109],
  [42.0036, 21.4178],
];

/** A few main streets for orientation (approximate). */
const ROADS: LL[][] = [
  [
    [42.0003, 21.4296],
    [42.0028, 21.4218],
    [42.0066, 21.4098],
    [42.0098, 21.3965],
    [42.0125, 21.38],
  ], // Партизанска
  [
    [42.0018, 21.4335],
    [42.0047, 21.4262],
    [42.0083, 21.4214],
    [42.0128, 21.4152],
  ], // Илинден
  [
    [41.9958, 21.4318],
    [41.9915, 21.4305],
    [41.9862, 21.4282],
    [41.9812, 21.4262],
  ], // Климент Охридски → Водно
  [
    [41.9982, 21.4245],
    [41.9952, 21.415],
    [41.9922, 21.401],
    [41.989, 21.386],
  ], // кон Карпош/Тафталиџе
  [
    [41.9952, 21.4392],
    [41.9993, 21.444],
    [42.004, 21.447],
  ], // Гоце Делчев
];

const LABELS = [
  { text: "Вардар", at: [41.9952, 21.4462] as LL },
  { text: "Градски парк", at: [42.0074, 21.4108] as LL },
  { text: "Центар", at: [41.9938, 21.4335] as LL },
  { text: "Карпош", at: [42.0035, 21.3925] as LL },
];

const EARTH_M_PER_DEG_LAT = 111_320;
const pointAt = (line: LL[], i: number): LL => line[i] ?? [0, 0];
const segMeters = (a: LL, b: LL) =>
  Math.hypot(
    (b[0] - a[0]) * EARTH_M_PER_DEG_LAT,
    (b[1] - a[1]) * EARTH_M_PER_DEG_LAT * Math.cos((a[0] * Math.PI) / 180),
  );
const lineMeters = (line: LL[]) =>
  line.slice(1).reduce((sum, b, i) => sum + segMeters(pointAt(line, i), b), 0);

/** Walks `meters` along a polyline from its point `startIndex`, in the given direction. */
function walk(line: LL[], startIndex: number, dir: 1 | -1, meters: number): LL[] {
  const out: LL[] = [pointAt(line, startIndex)];
  let left = meters;
  let i = startIndex;
  while (left > 0) {
    const next = i + dir;
    if (next < 0 || next >= line.length) break;
    const a = pointAt(line, i);
    const b = pointAt(line, next);
    const seg = segMeters(a, b);
    if (seg >= left) {
      const f = left / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      break;
    }
    out.push(b);
    left -= seg;
    i = next;
  }
  return out;
}

/** Shifts a line to one river bank (north +, south −), ~35 m. */
const bank = (line: LL[], side: 1 | -1): LL[] =>
  line.map(([lat, lon]) => [lat + side * 0.00032, lon]);

/** Densifies to a point every ~25 m with a little GPS-like wobble (deterministic). */
function gps(line: LL[], seed: number): LL[] {
  const r = rng(seed);
  const out: LL[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = pointAt(line, i);
    const b = pointAt(line, i + 1);
    const steps = Math.max(1, Math.round(segMeters(a, b) / 25));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      out.push([
        a[0] + (b[0] - a[0]) * f + r.between(-0.000025, 0.000025),
        a[1] + (b[1] - a[1]) * f + r.between(-0.000025, 0.000025),
      ]);
    }
  }
  const last = line.at(-1);
  if (last) out.push(last);
  return out;
}

const DEMO_CONTEXT = { water: [DEMO_VARDAR], parks: [CITY_PARK], roads: ROADS, labels: LABELS };

/** Out along the river from the Stone Bridge and back (south bank out, north bank back). */
function quayOutAndBack(dir: 1 | -1, meters: number): LL[] {
  if (meters < 100) return [];
  const out = walk(DEMO_VARDAR, BRIDGE, dir, meters / 2);
  return [...bank(out, -1), ...bank([...out].reverse(), 1)];
}

/**
 * Demo GPS route in Skopje that matches the distance:
 * - short: along the quay to the west and back;
 * - medium: south quay to the City Park, laps of the park, back on the north quay;
 * - long: as far west along the Vardar as the river line goes and back;
 * whatever is left over is an out-and-back along the quay to the east at the start.
 */
export function buildDemoRoute(distanceInMeters: number, seed = 1): RouteDto {
  const toPark = walk(DEMO_VARDAR, BRIDGE, -1, Number.POSITIVE_INFINITY).slice(0, BRIDGE - 4);
  const south = bank(toPark, -1);
  const north = bank([...toPark].reverse(), 1);
  const lap = lineMeters(CITY_PARK);
  const quay = lineMeters(south) + lineMeters(north);
  const westRoom = 2 * lineMeters(walk(DEMO_VARDAR, BRIDGE, -1, Number.POSITIVE_INFINITY));
  const eastRoom = 2 * lineMeters(walk(DEMO_VARDAR, BRIDGE, 1, Number.POSITIVE_INFINITY));

  let main: LL[];
  let used: number;
  if (distanceInMeters < quay + lap) {
    used = Math.min(distanceInMeters, westRoom);
    main = quayOutAndBack(-1, used);
  } else if (distanceInMeters <= quay + 3 * lap + eastRoom * 0.4) {
    const laps = Math.min(3, Math.floor((distanceInMeters - quay) / lap));
    const park: LL[] = [];
    for (let k = 0; k < laps; k++) park.push(...CITY_PARK);
    main = [...south, ...park, ...north];
    used = quay + laps * lap;
  } else {
    used = Math.min(distanceInMeters, westRoom);
    main = quayOutAndBack(-1, used);
  }
  const rest = Math.min(Math.max(0, distanceInMeters - used), eastRoom);
  return { points: gps([...quayOutAndBack(1, rest), ...main], seed), context: DEMO_CONTEXT };
}

/** What the demo needs to know about an activity to invent its laps. */
export interface DemoLapInput {
  activityType: string;
  distanceInMeters: number | null;
  durationInSeconds: number;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  startTimeInSeconds: number;
}

interface RawLap {
  intensity: LapIntensity;
  meters: number;
  /** Relative pace (seconds per metre, any scale): only ratios matter. */
  pace: number;
}

/**
 * Structured workouts in the plan text: "6 × 1000 m", "3 × 3 km", "10 × 1 min".
 * Returns reps with their length in metres (or seconds for time-based reps).
 */
function workoutStructure(
  description: string | null,
): { reps: number; meters?: number; seconds?: number; kind: "short" | "tempo" | "fartlek" } | null {
  if (!description) return null;
  const m = /(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(km|m|м|min|мин)(?!\p{L})/iu.exec(description);
  if (!m) return null;
  const reps = Number(m[1]);
  const value = Number((m[2] ?? "0").replace(",", "."));
  const unit = (m[3] ?? "").toLowerCase();
  if (unit === "km") return { reps, meters: value * 1000, kind: "tempo" };
  if (unit === "m" || unit === "м") return { reps, meters: value, kind: "short" };
  return { reps, seconds: value * 60, kind: "fartlek" };
}

/**
 * Laps for a demo activity: warm-up, intervals, recoveries and cool-down when the planned
 * session has a structure, otherwise auto-laps (1 km running, 5 km cycling). Laps add up
 * exactly to the activity's distance and elapsed time.
 */
export function buildDemoLaps(a: DemoLapInput, planDescription: string | null): ActivityLapDto[] {
  const total = a.distanceInMeters ?? 0;
  const running = a.activityType.includes("RUN");
  const cycling = a.activityType.includes("CYCLING") || a.activityType.includes("BIKING");
  if (total < 500 || (!running && !cycling)) return [];
  const r = rng(a.startTimeInSeconds);
  const structure = running ? workoutStructure(planDescription) : null;
  const raw: RawLap[] = [];

  if (structure) {
    const fast = structure.kind === "short" ? 0.8 : structure.kind === "tempo" ? 0.9 : 0.84;
    raw.push({ intensity: "warmup", meters: 2000, pace: 1.06 });
    for (let i = 0; i < structure.reps; i++) {
      const pace = fast * r.between(0.98, 1.02) * (i < 2 ? 1.02 : 1);
      const meters = structure.meters ?? (structure.seconds ?? 60) / pace / 0.3;
      raw.push({ intensity: "active", meters, pace });
      if (i < structure.reps - 1) {
        const rest =
          structure.kind === "fartlek" ? meters * 0.75 : structure.kind === "tempo" ? 400 : 200;
        raw.push({ intensity: "recovery", meters: rest, pace: 1.25 * r.between(0.97, 1.03) });
      }
    }
    const used = raw.reduce((sum, l) => sum + l.meters, 0);
    raw.push({ intensity: "cooldown", meters: Math.max(1000, total - used), pace: 1.08 });
  } else {
    const step = running ? 1000 : 5000;
    const n = Math.ceil(total / step);
    for (let i = 0; i < n; i++)
      raw.push({
        intensity: "active",
        meters: Math.min(step, total - i * step),
        pace: r.between(0.97, 1.03) * (1 - (i / n) * 0.03),
      });
  }

  // Scale to the recorded totals: distance first, then time (keeps the relative paces).
  const kDist = total / raw.reduce((sum, l) => sum + l.meters, 0);
  const rawTime = raw.reduce((sum, l) => sum + l.meters * kDist * l.pace, 0);
  const kTime = a.durationInSeconds / rawTime;
  const avg = a.averageHeartRateInBeatsPerMinute;
  const max = a.maxHeartRateInBeatsPerMinute;
  const hrShift: Record<LapIntensity, number> = {
    warmup: -12,
    active: structure ? 9 : -2,
    recovery: -4,
    rest: -10,
    cooldown: -9,
  };
  let offset = 0;
  let active = 0;
  const laps = raw.map((l, index): ActivityLapDto => {
    const durationInSeconds = Math.round(l.meters * kDist * l.pace * kTime);
    const drift = l.intensity === "active" ? active++ * (structure ? 0.9 : 0.5) : 0;
    const lapAvg =
      avg === null ? null : Math.round(avg + hrShift[l.intensity] + drift + r.between(-1.5, 1.5));
    const lap: ActivityLapDto = {
      index: index + 1,
      intensity: l.intensity,
      startOffsetInSeconds: offset,
      durationInSeconds,
      distanceInMeters: Math.round(l.meters * kDist),
      averageHeartRateInBeatsPerMinute: lapAvg,
      maxHeartRateInBeatsPerMinute:
        lapAvg === null || max === null ? null : Math.min(max, lapAvg + r.int(4, 10)),
    };
    offset += durationInSeconds;
    return lap;
  });
  // The hardest lap carries the activity's max heart rate.
  if (max !== null && laps.length) {
    const top = laps.reduce((best, l) =>
      (l.averageHeartRateInBeatsPerMinute ?? 0) > (best.averageHeartRateInBeatsPerMinute ?? 0)
        ? l
        : best,
    );
    top.maxHeartRateInBeatsPerMinute = max;
  }
  // Rounding: the last lap absorbs the remainder so laps add up exactly.
  const last = laps.at(-1);
  if (last) {
    last.durationInSeconds += a.durationInSeconds - offset;
    last.distanceInMeters =
      (last.distanceInMeters ?? 0) +
      total -
      laps.reduce((sum, l) => sum + (l.distanceInMeters ?? 0), 0);
  }
  return laps;
}

/** Demo recording device: a Garmin watch; chest strap for quality and long sessions. */
export function demoDevice(a: {
  activityType: string;
  trainingLoad: number | null;
}): ActivityDeviceDto {
  const cycling = a.activityType.includes("CYCLING");
  const strap = cycling || (a.trainingLoad ?? 0) >= 120;
  return {
    vendor: "garmin",
    deviceName: cycling ? "Edge 840" : "Forerunner 965",
    heartRateSensor: strap ? "chest_strap" : "optical",
    heartRateSensorName: strap ? "HRM-Pro Plus" : null,
  };
}

/** A typical 45-minute runner's strength session (core and legs), varied by the seed. */
export function buildDemoExercises(seed: number): ExerciseDto[] {
  const r = rng(seed);
  const kg = (base: number) => Math.round((base + r.int(-1, 2) * 2.5) * 2) / 2;
  const sets = (n: number, reps: number, weight: number | null) =>
    Array.from({ length: n }, () => ({ reps, weightInKilograms: weight, durationInSeconds: null }));
  return [
    { category: "SQUAT", name: "GOBLET_SQUAT", sets: sets(3, 10, kg(20)) },
    { category: "DEADLIFT", name: "SINGLE_LEG_ROMANIAN_DEADLIFT", sets: sets(3, 8, kg(12)) },
    { category: "LUNGE", name: "WALKING_LUNGE", sets: sets(3, 12, kg(10)) },
    { category: "HIP_RAISE", name: "SINGLE_LEG_HIP_RAISE", sets: sets(3, 12, null) },
    { category: "CALF_RAISE", name: "SINGLE_LEG_CALF_RAISE", sets: sets(3, 15, null) },
    {
      category: "PLANK",
      name: "SIDE_PLANK",
      sets: Array.from({ length: 3 }, () => ({
        reps: null,
        weightInKilograms: null,
        durationInSeconds: 40 + r.int(0, 2) * 5,
      })),
    },
  ];
}
