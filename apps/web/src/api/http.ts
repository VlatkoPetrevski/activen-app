import type {
  BriefingDto,
  MorningInputDto,
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
  TokenResponse,
  UserDto,
  ActivityDetailDto,
  AnalyticsSummaryDto,
  AthleteAnalyticsDto,
  ActivityDto,
  ConnectionDto,
  ImportResultDto,
  ImportsSummaryDto,
} from "@activen/contracts";
import type { AthleteSettings, LocalDate, WorkoutStructure } from "@activen/domain";
import {
  ApiError,
  type Api,
  type CommentInput,
  type FeedbackInput,
  type PlanInput,
  type PlanPatch,
  type SettingsInput,
} from "./api.js";
import type { Place } from "../lib/location.js";
import { fetchWeather } from "./open-meteo.js";

/** Header required by the API for cookie-based refresh (CSRF defence, ADR-0010). */
const CSRF = { "X-Requested-With": "activen" };

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The real API. The access token lives only in memory; the refresh token is an HttpOnly cookie the
 * browser sends to /v1/auth. A 401 triggers one refresh (shared by parallel requests) and a retry.
 */
export class HttpApi implements Api {
  readonly mode = "http" as const;
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl = "",
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  // --- transport ----------------------------------------------------------------------------------

  private async raw(method: Method, path: string, body?: unknown, auth = true): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    // Multipart bodies set their own Content-Type (with the boundary).
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers["Content-Type"] = "application/json";
    if (auth && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (path.startsWith("/v1/auth/")) Object.assign(headers, CSRF);
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        credentials: "include",
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(0, "Network error");
    }
  }

  private async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res = await this.raw(method, path, body);
    if (res.status === 401 && !path.startsWith("/v1/auth/") && (await this.refresh()))
      res = await this.raw(method, path, body);
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const p = (data ?? {}) as {
        detail?: string;
        title?: string;
        code?: string;
        providers?: string[];
      };
      throw new ApiError(res.status, p.detail ?? p.title ?? res.statusText, p.code, p.providers);
    }
    return data as T;
  }

  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const res = await this.raw("POST", "/v1/auth/refresh", {}, false);
        if (!res.ok) {
          this.accessToken = null;
          return false;
        }
        this.accessToken = ((await res.json()) as TokenResponse).accessToken;
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async signedIn(res: SignInResponse): Promise<SignInResponse> {
    this.accessToken = res.accessToken;
    return res;
  }

  // --- auth ---------------------------------------------------------------------------------------

  providers = () => this.request<ProvidersDto>("GET", "/v1/auth/providers");
  restoreSession = () => this.refresh();
  startEmailSignIn = async (email: string, locale: string) => {
    await this.request("POST", "/v1/auth/email/start", { email, locale });
  };
  verifyEmailSignIn = async (token: string) =>
    this.signedIn(await this.request<SignInResponse>("POST", "/v1/auth/email/verify", { token }));
  signInWithIdToken = async (
    provider: "google" | "apple",
    idToken: string,
    nonce: string,
    displayName?: string,
  ) =>
    this.signedIn(
      await this.request<SignInResponse>("POST", `/v1/auth/${provider}`, {
        idToken,
        nonce,
        ...(displayName ? { displayName } : {}),
      }),
    );
  signOut = async () => {
    try {
      await this.request("POST", "/v1/auth/logout", {});
    } finally {
      this.accessToken = null;
    }
  };

  // --- me -----------------------------------------------------------------------------------------

  me = () => this.request<MeDto>("GET", "/v1/me");
  updateProfile = (displayName: string) =>
    this.request<UserDto>("PATCH", "/v1/me", { displayName });
  updateSettings = (patch: SettingsInput) =>
    this.request<AthleteSettings>("PATCH", "/v1/me/settings", patch);
  addRole = async (role: "athlete" | "coach") =>
    (await this.request<{ roles: string[] }>("PUT", `/v1/me/roles/${role}`)).roles;
  removeRole = async (role: "athlete" | "coach") =>
    (await this.request<{ roles: string[] }>("DELETE", `/v1/me/roles/${role}`)).roles;
  sessions = () => this.request<SessionDto[]>("GET", "/v1/me/sessions");
  revokeSession = (id: string) => this.request<undefined>("DELETE", `/v1/me/sessions/${id}`);
  revokeOtherSessions = async () =>
    (await this.request<{ revoked: number }>("POST", "/v1/me/sessions/revoke-others")).revoked;
  unlinkIdentity = (id: string) => this.request<IdentityDto[]>("DELETE", `/v1/me/identities/${id}`);
  startEmailLink = async (email: string, locale: string) => {
    await this.request("POST", "/v1/me/identities/email/start", { email, locale });
  };
  verifyEmailLink = (token: string) =>
    this.request<IdentityDto[]>("POST", "/v1/me/identities/email/verify", { token });
  deleteAccount = async () => {
    await this.request("DELETE", "/v1/me", { confirm: "DELETE" });
    this.accessToken = null;
  };

  // --- training -----------------------------------------------------------------------------------

  weather = (place: Place) => fetchWeather(place).catch(() => null);
  briefing = (date?: LocalDate) =>
    this.request<BriefingDto>("GET", date ? `/v1/me/briefing?date=${date}` : "/v1/me/briefing");
  saveMorningInput = (date: LocalDate, input: MorningInputDto) =>
    this.request<BriefingDto>("PUT", `/v1/me/wellness/${date}`, input);
  calendar = (from: LocalDate, to: LocalDate) =>
    this.request<CalendarDto>("GET", `/v1/me/calendar?from=${from}&to=${to}`);
  createPlan = (input: PlanInput) => this.request<PlanEntryDto>("POST", "/v1/me/plan", input);
  updatePlan = (id: string, patch: PlanPatch) =>
    this.request<PlanEntryDto>("PATCH", `/v1/me/plan/${id}`, patch);
  deletePlan = (id: string) => this.request<undefined>("DELETE", `/v1/me/plan/${id}`);
  activities = (from: LocalDate, to: LocalDate) =>
    this.request<ActivityDto[]>("GET", `/v1/me/activities?from=${from}&to=${to}`);
  activity = (id: string) => this.request<ActivityDetailDto>("GET", `/v1/me/activities/${id}`);
  importActivities = async (files: readonly File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);
    return (
      await this.request<{ results: ImportResultDto[] }>("POST", "/v1/me/activities/import", form)
    ).results;
  };
  imports = () => this.request<ImportsSummaryDto>("GET", "/v1/me/imports");
  connections = () => this.request<ConnectionDto[]>("GET", "/v1/me/connections");
  connectPolar = () =>
    this.request<{ authorizeUrl: string }>("POST", "/v1/me/connections/polar", {});
  syncPolar = () =>
    this.request<{ stored: number; skipped: number; mornings: number }>(
      "POST",
      "/v1/me/connections/polar/sync",
      {},
    );
  disconnectPolar = () => this.request<undefined>("DELETE", "/v1/me/connections/polar");
  saveFeedback = (activityId: string, input: FeedbackInput) =>
    this.request<FeedbackDto>("PUT", `/v1/me/activities/${activityId}/feedback`, input);
  progress = (weeks: number) => this.request<ProgressDto>("GET", `/v1/me/progress?weeks=${weeks}`);
  coaches = () => this.request<CoachLinkDto[]>("GET", "/v1/me/coaches");
  acceptCoach = (linkId: string, scopes: ConsentScope[]) =>
    this.request<undefined>("POST", `/v1/me/coaches/${linkId}/accept`, { scopes });
  updateCoachScopes = (linkId: string, scopes: ConsentScope[]) =>
    this.request<undefined>("PUT", `/v1/me/coaches/${linkId}/scopes`, { scopes });
  endCoach = (linkId: string) => this.request<undefined>("DELETE", `/v1/me/coaches/${linkId}`);
  comments = () => this.request<CommentDto[]>("GET", "/v1/me/comments");
  postComment = (input: CommentInput) => this.request<CommentDto>("POST", "/v1/me/comments", input);

  // --- coach --------------------------------------------------------------------------------------

  coachAthletes = () => this.request<CoachAthleteDto[]>("GET", "/v1/coach/athletes");
  inviteAthlete = async (email: string) => {
    await this.request("POST", "/v1/coach/invites", { email });
  };
  structureWorkout = (text: string, locale: string) =>
    this.request<{ structure: WorkoutStructure | null }>("POST", "/v1/workouts/structure", {
      text,
      locale,
    });
  coachAnalytics = () => this.request<AnalyticsSummaryDto[]>("GET", "/v1/coach/analytics");
  athleteAnalytics = (athleteId: string) =>
    this.request<AthleteAnalyticsDto>("GET", `/v1/coach/athletes/${athleteId}/analytics`);
  athleteActivity = (athleteId: string, id: string) =>
    this.request<ActivityDetailDto>("GET", `/v1/coach/athletes/${athleteId}/activities/${id}`);
  athleteCalendar = (athleteId: string, from: LocalDate, to: LocalDate) =>
    this.request<CalendarDto>(
      "GET",
      `/v1/coach/athletes/${athleteId}/calendar?from=${from}&to=${to}`,
    );
  athleteBriefing = (athleteId: string) =>
    this.request<BriefingDto>("GET", `/v1/coach/athletes/${athleteId}/briefing`);
  athleteProgress = (athleteId: string, weeks: number) =>
    this.request<ProgressDto>("GET", `/v1/coach/athletes/${athleteId}/progress?weeks=${weeks}`);
  createAthletePlan = (athleteId: string, input: PlanInput) =>
    this.request<PlanEntryDto>("POST", `/v1/coach/athletes/${athleteId}/plan`, input);
  updateAthletePlan = (athleteId: string, id: string, patch: PlanPatch) =>
    this.request<PlanEntryDto>("PATCH", `/v1/coach/athletes/${athleteId}/plan/${id}`, patch);
  deleteAthletePlan = (athleteId: string, id: string) =>
    this.request<undefined>("DELETE", `/v1/coach/athletes/${athleteId}/plan/${id}`);
  athleteComments = (athleteId: string) =>
    this.request<CommentDto[]>("GET", `/v1/coach/athletes/${athleteId}/comments`);
  postAthleteComment = (athleteId: string, input: CommentInput) =>
    this.request<CommentDto>("POST", `/v1/coach/athletes/${athleteId}/comments`, input);
  endAthlete = (athleteId: string) =>
    this.request<undefined>("DELETE", `/v1/coach/athletes/${athleteId}`);
}
