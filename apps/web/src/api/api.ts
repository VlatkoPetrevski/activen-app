import type { PlanEntryCreate, PlanEntryUpdate, SettingsPatch } from "@activen/contracts/requests";
import type {
  ActivityDetailDto,
  AnalyticsSummaryDto,
  AthleteAnalyticsDto,
  ActivityDto,
  CalendarDto,
  CoachAthleteDto,
  CoachLinkDto,
  CommentDto,
  ConsentScope,
  FeedbackDto,
  IdentityDto,
  MeDto,
  PlanEntryDto,
  ProgressDto,
  ProvidersDto,
  SessionDto,
  SignInResponse,
  UserDto,
  WeatherDto,
  BriefingDto,
  MorningInputDto,
  ConnectionDto,
  ImportResultDto,
  ImportsSummaryDto,
} from "@activen/contracts";
import type { AthleteSettings, LocalDate, WorkoutStructure } from "@activen/domain";
import type { z } from "zod";
import type { Place } from "../lib/location.js";

export type PlanInput = z.input<typeof PlanEntryCreate>;
export type PlanPatch = z.input<typeof PlanEntryUpdate>;
export type SettingsInput = z.input<typeof SettingsPatch>;
export interface FeedbackInput {
  perceivedEffort: number | null;
  feel: number | null;
  comment: string | null;
}
export interface CommentInput {
  body: string;
  activityId?: string | null;
  planEntryId?: string | null;
}

/** RFC 9457 problem returned by the API (or a network failure, status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly providers?: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Everything the app needs from the server. Two implementations: HTTP (the real API) and Demo
 * (in-memory sample data computed with the same domain rules).
 */
/** Files per upload request (the server accepts up to 20). */
export const IMPORT_BATCH = 20;

export interface Api {
  readonly mode: "http" | "demo";

  providers(): Promise<ProvidersDto>;
  /** Restores a session (refresh cookie / demo persona); false when signed out. */
  restoreSession(): Promise<boolean>;
  startEmailSignIn(email: string, locale: string): Promise<void>;
  verifyEmailSignIn(token: string): Promise<SignInResponse>;
  signInWithIdToken(
    provider: "google" | "apple",
    idToken: string,
    nonce: string,
    displayName?: string,
  ): Promise<SignInResponse>;
  signInDemo?(persona: "athlete" | "coach"): Promise<void>;
  signOut(): Promise<void>;

  me(): Promise<MeDto>;
  updateProfile(displayName: string): Promise<UserDto>;
  updateSettings(patch: SettingsInput): Promise<AthleteSettings>;
  addRole(role: "athlete" | "coach"): Promise<string[]>;
  removeRole(role: "athlete" | "coach"): Promise<string[]>;
  sessions(): Promise<SessionDto[]>;
  revokeSession(id: string): Promise<void>;
  revokeOtherSessions(): Promise<number>;
  unlinkIdentity(id: string): Promise<IdentityDto[]>;
  startEmailLink(email: string, locale: string): Promise<void>;
  verifyEmailLink(token: string): Promise<IdentityDto[]>;
  deleteAccount(): Promise<void>;

  /** Readiness and the advice for today's session (or another morning). */
  briefing(date?: LocalDate): Promise<BriefingDto>;
  /** What the athlete measured this morning: sleep and resting pulse (both null removes it). */
  saveMorningInput(date: LocalDate, input: MorningInputDto): Promise<BriefingDto>;
  /** Today's weather and air quality at a place (null when the provider is unreachable). */
  weather(place: Place): Promise<WeatherDto | null>;
  calendar(from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  createPlan(input: PlanInput): Promise<PlanEntryDto>;
  updatePlan(id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  deletePlan(id: string): Promise<void>;
  activities(from: LocalDate, to: LocalDate): Promise<ActivityDto[]>;
  activity(id: string): Promise<ActivityDetailDto>;
  /**
   * Uploads FIT/GPX/TCX files (at most {@link IMPORT_BATCH} per call); one result per file, in
   * order. The same workout is never stored twice (see ImportResultDto).
   */
  importActivities(files: readonly File[]): Promise<ImportResultDto[]>;
  /** Files imported so far and the latest attempts (Profile › Sources). */
  imports(): Promise<ImportsSummaryDto>;
  /** Connectable apps (Polar…) and the athlete's connections. */
  connections(): Promise<ConnectionDto[]>;
  /** The Polar Flow page that asks the athlete to allow ActiveN (the browser goes there). */
  connectPolar(): Promise<{ authorizeUrl: string }>;
  /** Fetches what Polar Flow offers now (last 30 days). */
  syncPolar(): Promise<{ stored: number; skipped: number; mornings: number }>;
  /** Disconnects Polar; its workouts are removed here (they stay in Polar Flow). */
  disconnectPolar(): Promise<void>;
  saveFeedback(activityId: string, input: FeedbackInput): Promise<FeedbackDto>;
  progress(weeks: number): Promise<ProgressDto>;
  /** "Структурирај": steps suggested for a plan text (null when nothing is structured). */
  structureWorkout(text: string, locale: string): Promise<{ structure: WorkoutStructure | null }>;
  coaches(): Promise<CoachLinkDto[]>;
  acceptCoach(linkId: string, scopes: ConsentScope[]): Promise<void>;
  updateCoachScopes(linkId: string, scopes: ConsentScope[]): Promise<void>;
  endCoach(linkId: string): Promise<void>;
  comments(): Promise<CommentDto[]>;
  postComment(input: CommentInput): Promise<CommentDto>;

  coachAthletes(): Promise<CoachAthleteDto[]>;
  /** Analytics overview of the active athletes, attention first. */
  coachAnalytics(): Promise<AnalyticsSummaryDto[]>;
  athleteAnalytics(athleteId: string): Promise<AthleteAnalyticsDto>;
  inviteAthlete(email: string): Promise<void>;
  athleteCalendar(athleteId: string, from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  /** One activity of a coached athlete (requires the activities consent). */
  athleteActivity(athleteId: string, id: string): Promise<ActivityDetailDto>;
  athleteProgress(athleteId: string, weeks: number): Promise<ProgressDto>;
  /** The athlete's morning briefing (requires the sleep_recovery consent). */
  athleteBriefing(athleteId: string): Promise<BriefingDto>;
  createAthletePlan(athleteId: string, input: PlanInput): Promise<PlanEntryDto>;
  updateAthletePlan(athleteId: string, id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  deleteAthletePlan(athleteId: string, id: string): Promise<void>;
  athleteComments(athleteId: string): Promise<CommentDto[]>;
  postAthleteComment(athleteId: string, input: CommentInput): Promise<CommentDto>;
  endAthlete(athleteId: string): Promise<void>;
}
