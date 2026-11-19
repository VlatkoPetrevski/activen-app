import type { PlanEntryCreate, PlanEntryUpdate, SettingsPatch } from "@activen/contracts/requests";
import type {
  ActivityDetailDto,
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
  WellnessDto,
} from "@activen/contracts";
import type { AthleteSettings, LocalDate } from "@activen/domain";
import type { z } from "zod";

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

  wellness(date: LocalDate): Promise<WellnessDto | null>;
  calendar(from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  createPlan(input: PlanInput): Promise<PlanEntryDto>;
  updatePlan(id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  deletePlan(id: string): Promise<void>;
  activities(from: LocalDate, to: LocalDate): Promise<ActivityDto[]>;
  activity(id: string): Promise<ActivityDetailDto>;
  saveFeedback(activityId: string, input: FeedbackInput): Promise<FeedbackDto>;
  progress(weeks: number): Promise<ProgressDto>;
  coaches(): Promise<CoachLinkDto[]>;
  acceptCoach(linkId: string, scopes: ConsentScope[]): Promise<void>;
  updateCoachScopes(linkId: string, scopes: ConsentScope[]): Promise<void>;
  endCoach(linkId: string): Promise<void>;
  comments(): Promise<CommentDto[]>;
  postComment(input: CommentInput): Promise<CommentDto>;

  coachAthletes(): Promise<CoachAthleteDto[]>;
  inviteAthlete(email: string): Promise<void>;
  athleteCalendar(athleteId: string, from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  athleteProgress(athleteId: string, weeks: number): Promise<ProgressDto>;
  createAthletePlan(athleteId: string, input: PlanInput): Promise<PlanEntryDto>;
  updateAthletePlan(athleteId: string, id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  deleteAthletePlan(athleteId: string, id: string): Promise<void>;
  athleteComments(athleteId: string): Promise<CommentDto[]>;
  postAthleteComment(athleteId: string, input: CommentInput): Promise<CommentDto>;
  endAthlete(athleteId: string): Promise<void>;
}
