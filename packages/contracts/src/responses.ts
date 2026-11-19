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

export interface ActivityDetailDto {
  activity: ActivityDto;
  planEntry: PlanEntryDto | null;
  comments: CommentDto[];
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
  week: { planned: number; completed: number };
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
