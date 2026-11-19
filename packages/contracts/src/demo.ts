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
import type { WeatherDto, WellnessDto } from "./responses.js";

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
