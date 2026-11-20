/**
 * Response shapes of the ActiveN API (JSON: dates are ISO strings, calendar dates `YYYY-MM-DD`).
 * The server returns these; clients consume them. Field names follow the domain (Garmin) vocabulary.
 */
import type {
  Activity,
  AthleteSettings,
  Kpis,
  LocalDate,
  MixEntry,
  PeriodSummary,
  PlanEntry,
  PlanLink,
  Vendor,
} from "@activen/domain";

export type Role = "athlete" | "coach" | "admin";
export type AuthProvider = "google" | "apple" | "email";
export type ConsentScope = "activities" | "sleep_recovery" | "location" | "comments";
export type IsoDateTime = string;

export interface UserDto {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
}

export interface IdentityDto {
  id: string;
  provider: AuthProvider;
  email: string | null;
  createdAt: IsoDateTime;
}

export interface SessionDto {
  id: string;
  createdAt: IsoDateTime;
  lastUsedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  userAgent: string | null;
  current: boolean;
}

export interface MeDto {
  user: UserDto;
  identities: IdentityDto[];
  settings: AthleteSettings;
}

export interface ProvidersDto {
  google: boolean;
  apple: boolean;
  email: boolean;
}

export interface TokenResponse {
  tokenType: "Bearer";
  accessToken: string;
  expiresIn: number;
  refreshExpiresAt: IsoDateTime;
  /** Only for `client: "native"`; the web keeps it in an HttpOnly cookie. */
  refreshToken?: string;
}

export interface SignInResponse extends TokenResponse {
  user: UserDto;
  created: boolean;
}

export interface FeedbackDto {
  perceivedEffort: number | null;
  feel: number | null;
  comment: string | null;
  updatedAt: IsoDateTime;
}

export interface PlanEntryDto extends PlanEntry {
  version: number;
}

export interface ActivityDto extends Activity {
  feedback: FeedbackDto | null;
}

/** Plan and activities in a date range, with the plan ↔ activity links (domain matching rules). */
export interface CalendarDto {
  athleteId: string;
  from: LocalDate;
  to: LocalDate;
  entries: PlanEntryDto[];
  activities: ActivityDto[];
  links: PlanLink[];
  /** False when a coach looks without the athlete's "activities" consent. */
  activitiesVisible: boolean;
}

export interface CommentDto {
  id: string;
  athleteId: string;
  authorId: string | null;
  authorName: string | null;
  activityId: string | null;
  planEntryId: string | null;
  body: string;
  createdAt: IsoDateTime;
}

/** One observation for the automatic activity summary (rendered as a sentence by the client). */
export type ActivityInsight =
  | { code: "plan_on_target" }
  | { code: "plan_over"; percent: number }
  | { code: "plan_under"; percent: number }
  | { code: "longest_recent" }
  | { code: "pace_faster"; secondsPerKm: number }
  | { code: "pace_slower"; secondsPerKm: number }
  | { code: "lower_hr"; bpm: number }
  | { code: "higher_hr"; bpm: number }
  | { code: "big_load" }
  | { code: "hilly"; meters: number };

/** GPS route as [latitude, longitude] pairs (simplified for display). */
export interface RouteDto {
  points: [number, number][];
  /**
   * Map context drawn when map tiles are unavailable (the embedded demo cannot load external
   * images): rivers, parks, main roads and place names, so the route reads as a real place.
   */
  context?: {
    water: [number, number][][];
    parks: [number, number][][];
    roads: [number, number][][];
    labels: { text: string; at: [number, number] }[];
  };
}

/**
 * Lap intensity as the device recorded it (FIT `lap.intensity`, Garmin workout step
 * intensity). Auto-laps of an unstructured run are all "active".
 */
export type LapIntensity = "warmup" | "active" | "recovery" | "rest" | "cooldown";

/** One lap / workout step: only the fields the planner and coach need. */
export interface ActivityLapDto {
  index: number;
  intensity: LapIntensity;
  /** Seconds from the activity start. */
  startOffsetInSeconds: number;
  /** Elapsed lap time (pace is computed from elapsed time). */
  durationInSeconds: number;
  distanceInMeters: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
}

/** Where the numbers came from: recording device and heart-rate sensor. */
export interface ActivityDeviceDto {
  vendor: Vendor;
  /** "Forerunner 965"; null when the source does not say. */
  deviceName: string | null;
  /** Chest strap (accurate for intervals) or optical wrist sensor; null when unknown. */
  heartRateSensor: "chest_strap" | "optical" | null;
  /** "HRM-Pro Plus"; null when unknown or optical. */
  heartRateSensorName: string | null;
}

/**
 * One exercise of a strength session with its sets (FIT `set` messages / Garmin exercise
 * sets). `category` is the Garmin exercise category (SQUAT, LUNGE, PLANK…), `name` the
 * specific exercise when the device knows it.
 */
export interface ExerciseDto {
  category: string;
  name: string | null;
  sets: {
    reps: number | null;
    weightInKilograms: number | null;
    durationInSeconds: number | null;
  }[];
}

export interface ActivityDetailDto {
  activity: ActivityDto;
  /** Strength sessions: exercises in the order done; empty for other sports or until synced. */
  exercises: ExerciseDto[];
  /** Laps / workout steps in order; empty until the source delivers them. */
  laps: ActivityLapDto[];
  device: ActivityDeviceDto;
  /** Null without GPS, or when the viewer may not see locations. */
  route: RouteDto | null;
  planEntry: PlanEntryDto | null;
  comments: CommentDto[];
  /** Automatic narrative: comparisons with the plan and the last 4 weeks (most relevant first). */
  insights: ActivityInsight[];
}

export interface ProgressDto {
  weeks: PeriodSummary[];
  /** Running KPIs for the last 4 weeks and the 4 weeks before (trend). */
  last4Weeks: Kpis;
  previous4Weeks: Kpis;
  mix: MixEntry[];
}

/** A coach as the athlete sees the relationship. */
export interface CoachLinkDto {
  linkId: string;
  coachId: string;
  coachName: string;
  status: "invited" | "active";
  scopes: ConsentScope[];
}

/** An athlete in the coach's list. */
export interface CoachAthleteDto {
  linkId: string;
  athleteId: string;
  displayName: string;
  status: "invited" | "active";
  scopes: ConsentScope[];
  primarySource: Vendor | null;
  /** This week's planned workouts, completed ones and planned distance (km/mi target). */
  week: { planned: number; completed: number; plannedDistanceInMeters: number };
  /**
   * Everything the athlete recorded this week (Monday to today), planned or not.
   * Null for invitations and when activities are not shared with the coach.
   */
  weekTotals: { distanceInMeters: number; durationInSeconds: number; count: number } | null;
  lastActivity: {
    calendarDate: LocalDate;
    activityType: string;
    distanceInMeters: number | null;
    durationInSeconds: number | null;
    perceivedEffort: number | null;
  } | null;
  /** Signals for the "needs attention" list. */
  signals: CoachSignal[];
  lastComment: { body: string; createdAt: IsoDateTime; fromAthlete: boolean } | null;
}

export type CoachSignal =
  | { code: "missed_sessions"; count: number }
  | { code: "high_effort_on_easy_day"; perceivedEffort: number; calendarDate: LocalDate }
  | { code: "awaiting_reply" };

/** Morning wellness (Garmin principle). Not available until a device is connected. */
export interface WellnessDto {
  calendarDate: LocalDate;
  trainingReadiness: number | null;
  hrvStatus: "balanced" | "unbalanced" | "low" | "poor" | "none";
  lastNightHrvMs: number | null;
  sleepScore: number | null;
  sleepDurationInSeconds: number | null;
  restingHeartRate: number | null;
  recoveryTimeInMinutes: number | null;
}

/** Today's weather at the athlete's location (provider: Open-Meteo). Temperatures in °C. */
export interface WeatherDto {
  location: { name: string | null; latitude: number; longitude: number };
  current: {
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
    isDay: boolean;
    windSpeedKmh: number;
  };
  today: {
    min: number;
    max: number;
    sunrise: string; // local "HH:MM"
    sunset: string;
    uvIndexMax: number | null;
    precipitationProbabilityMax: number | null;
  };
  /** Hourly forecast for today, local hours 0–23. */
  hourly: {
    hour: number;
    temperature: number;
    precipitationProbability: number | null;
    weatherCode: number;
    europeanAqi: number | null;
  }[];
  airQuality: { europeanAqi: number; pm2_5: number | null; pm10: number | null } | null;
}
