import {
  activityInsights,
  buildDemoRoute,
  buildDemoTraining,
  buildDemoWeather,
  calendarView,
  coachRowRange,
  coachRowView,
  progressView,
  type ActivityDto,
  type CalendarDto,
  type CoachAthleteDto,
  type CommentDto,
  type ConsentScope,
  type DemoLocale,
  type FeedbackDto,
  type IdentityDto,
  type MeDto,
  type PlanEntryDto,
  type SessionDto,
  type WellnessDto,
} from "@activen/contracts";
import {
  addDays,
  DEFAULT_ATHLETE_SETTINGS,
  localDateOf,
  type Activity,
  type AthleteSettings,
  type LocalDate,
} from "@activen/domain";
import {
  ApiError,
  type Api,
  type CommentInput,
  type FeedbackInput,
  type PlanInput,
  type PlanPatch,
  type SettingsInput,
} from "./api.js";

type Persona = "athlete" | "coach";

interface DemoAthlete {
  id: string;
  name: string;
  email: string;
  settings: AthleteSettings;
  entries: PlanEntryDto[];
  activities: Activity[];
  feedback: Map<string, FeedbackDto>;
  wellness: WellnessDto[];
  /** Relationship with the coach Ана. */
  link: { id: string; status: "active" | "invited"; scopes: ConsentScope[] } | null;
  comments: CommentDto[];
}

const COACH = { id: "demo-ana", name: "Ана Стојанова", email: "ana.coach@example.com" };
const ROSTER: {
  id: string;
  name: string;
  seed: number;
  skipRate: number;
  heavyDay: boolean;
  weekShift: number;
}[] = [
  {
    id: "demo-vlatko",
    name: "Влатко Петревски",
    seed: 7,
    skipRate: 0.08,
    heavyDay: true,
    weekShift: 0,
  },
  {
    id: "demo-mila",
    name: "Мила Стојковска",
    seed: 11,
    skipRate: 0.05,
    heavyDay: false,
    weekShift: 1,
  },
  {
    id: "demo-petar",
    name: "Петар Костов",
    seed: 23,
    skipRate: 0.45,
    heavyDay: false,
    weekShift: 2,
  },
  {
    id: "demo-jovana",
    name: "Јована Трајковска",
    seed: 31,
    skipRate: 0.02,
    heavyDay: false,
    weekShift: 6,
  },
  {
    id: "demo-stefan",
    name: "Стефан Димитров",
    seed: 41,
    skipRate: 0.1,
    heavyDay: true,
    weekShift: 3,
  },
  {
    id: "demo-marija",
    name: "Марија Лазарова",
    seed: 53,
    skipRate: 0.1,
    heavyDay: false,
    weekShift: 1,
  },
];
const EN_NAMES: Record<string, string> = {
  "demo-ana": "Ana Stojanova",
  "demo-vlatko": "Vlatko Petrevski",
  "demo-mila": "Mila Stojkovska",
  "demo-petar": "Petar Kostov",
  "demo-jovana": "Jovana Trajkovska",
  "demo-stefan": "Stefan Dimitrov",
  "demo-marija": "Marija Lazarova",
};

const THREAD = {
  mk: [
    {
      from: "coach",
      days: 4,
      body: "Одлична недела! Во сабота долгото го држиме на 5:20/km, без брзање на крајот.",
    },
    { from: "athlete", days: 3, body: "Супер, ќе пробам. Дали гелот на 15 km е во ред?" },
    {
      from: "coach",
      days: 3,
      body: "Да — на 12 и на 20 km. Пробај го истиот гел што ќе го користиш на трката.",
    },
    {
      from: "athlete",
      days: 1,
      body: "Вчерашното лесно трчање беше тешко, нозете тешки од почеток. Спиев лошо.",
    },
  ],
  en: [
    {
      from: "coach",
      days: 4,
      body: "Great week! On Saturday keep the long run at 5:20/km, no rushing at the end.",
    },
    { from: "athlete", days: 3, body: "Great, will do. Is a gel at 15 km fine?" },
    {
      from: "coach",
      days: 3,
      body: "Yes — at 12 and 20 km. Use the same gel you'll take in the race.",
    },
    {
      from: "athlete",
      days: 1,
      body: "Yesterday's easy run felt hard, heavy legs from the start. Slept badly.",
    },
  ],
} as const;

const STORAGE_KEY = "activen.demo.persona";
const storage = {
  get: () => {
    try {
      const v = sessionStorage.getItem(STORAGE_KEY);
      return v === "athlete" || v === "coach" ? v : null;
    } catch {
      return null;
    }
  },
  set: (v: Persona | null) => {
    try {
      if (v) sessionStorage.setItem(STORAGE_KEY, v);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode, sandbox): the demo still works for this page view */
    }
  },
};

/**
 * In-memory sample data with the same rules as the server (domain matching, shared view builders),
 * so screens can be reviewed without an account or a connected device. Nothing leaves the browser.
 */
export class DemoApi implements Api {
  readonly mode = "demo" as const;
  private persona: Persona | null = null;
  private athletes = new Map<string, DemoAthlete>();
  private coachRoles: ("athlete" | "coach")[] = ["athlete", "coach"];
  private athleteRoles: ("athlete" | "coach")[] = ["athlete"];
  /** The coach's own training (coaches train too). */
  private coachSelf: DemoAthlete | null = null;
  private seq = 0;

  constructor(
    private readonly locale: () => DemoLocale = () => "mk",
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): LocalDate {
    return localDateOf(this.now().toISOString(), "Europe/Skopje");
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq.toString(36)}`;
  }

  private name(id: string, fallback: string): string {
    return this.locale() === "en" ? (EN_NAMES[id] ?? fallback) : fallback;
  }

  private build(): void {
    const today = this.today();
    const locale = this.locale();
    this.athletes.clear();
    for (const [i, r] of ROSTER.entries()) {
      const demo = buildDemoTraining({
        today,
        locale,
        seed: r.seed,
        skipRate: r.skipRate,
        heavyDay: r.heavyDay,
        weekShift: r.weekShift,
      });
      const activities: Activity[] = demo.activities.map(({ vendor, externalId, ...a }) => ({
        ...a,
        id: `${r.id}-${externalId}`,
        athleteId: r.id,
        source: { vendor, externalId },
        deleted: false,
      }));
      const feedback = new Map<string, FeedbackDto>(
        demo.feedback.map((f) => [
          `${r.id}-${f.externalId}`,
          {
            perceivedEffort: f.perceivedEffort,
            feel: f.feel,
            comment: f.comment,
            updatedAt: this.now().toISOString(),
          },
        ]),
      );
      const athlete: DemoAthlete = {
        id: r.id,
        name: this.name(r.id, r.name),
        email: `${r.id.replace("demo-", "")}@example.com`,
        settings: { ...DEFAULT_ATHLETE_SETTINGS, locale },
        entries: demo.planEntries.map(({ key, ...e }) => ({
          ...e,
          id: `${r.id}-${key}`,
          athleteId: r.id,
          version: 1,
        })),
        activities,
        feedback,
        wellness: demo.wellness,
        link: {
          id: `link-${r.id}`,
          status: "active",
          // Марија shares only the plan and messages — the coach sees "not shared".
          scopes: i === 5 ? ["comments"] : ["activities", "sleep_recovery", "comments"],
        },
        comments: [],
      };
      if (i === 0) {
        // Leave the most recent session (without a comment) unrated: Today asks for a check-in.
        const latest = [...activities]
          .sort((x, y) => y.startTimeInSeconds - x.startTimeInSeconds)
          .find((x) => !feedback.get(x.id)?.comment);
        if (latest) feedback.delete(latest.id);
      }
      if (i === 0)
        athlete.comments = THREAD[locale]
          .map((m, n) => ({
            id: `c-${n}`,
            athleteId: r.id,
            authorId: m.from === "coach" ? COACH.id : r.id,
            authorName: m.from === "coach" ? this.name(COACH.id, COACH.name) : athlete.name,
            activityId: null,
            planEntryId: null,
            body: m.body,
            createdAt: new Date(
              this.now().getTime() - m.days * 86_400_000 + n * 60_000,
            ).toISOString(),
          }))
          .reverse();
      this.athletes.set(r.id, athlete);
    }
    const invited: DemoAthlete = {
      id: "demo-nikola",
      name: locale === "en" ? "Nikola Ristov" : "Никола Ристов",
      email: "nikola@example.com",
      settings: { ...DEFAULT_ATHLETE_SETTINGS },
      entries: [],
      activities: [],
      feedback: new Map(),
      wellness: [],
      link: { id: "link-demo-nikola", status: "invited", scopes: [] },
      comments: [],
    };
    this.athletes.set(invited.id, invited);
    const own = buildDemoTraining({
      today,
      locale,
      seed: 99,
      skipRate: 0.2,
      weeksBack: 6,
      heavyDay: false,
    });
    this.coachSelf = {
      id: COACH.id,
      name: this.name(COACH.id, COACH.name),
      email: COACH.email,
      settings: { ...DEFAULT_ATHLETE_SETTINGS, locale },
      entries: own.planEntries.map(({ key, ...e }) => ({
        ...e,
        id: `${COACH.id}-${key}`,
        athleteId: COACH.id,
        version: 1,
      })),
      activities: own.activities.map(({ vendor, externalId, ...a }) => ({
        ...a,
        id: `${COACH.id}-${externalId}`,
        athleteId: COACH.id,
        source: { vendor, externalId },
        deleted: false,
      })),
      feedback: new Map(),
      wellness: own.wellness,
      link: null,
      comments: [],
    };
  }

  /** The signed-in person's own training data. */
  private me_(): DemoAthlete {
    const a = this.persona === "coach" ? this.coachSelf : this.athletes.get("demo-vlatko");
    if (!this.persona || !a) throw new ApiError(401, "Not signed in", "invalid");
    return a;
  }

  private shares(a: DemoAthlete): boolean {
    return a.link?.scopes.includes("activities") ?? false;
  }

  private athlete(id: string): DemoAthlete {
    const a = this.athletes.get(id);
    if (!a || a.link?.status !== "active") throw new ApiError(404, "Athlete not found");
    return a;
  }

  private delay<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 60));
  }

  // --- auth ---------------------------------------------------------------------------------------

  providers: Api["providers"] = () => this.delay({ google: false, apple: false, email: false });
  restoreSession = async () => {
    const persona = storage.get();
    if (!persona) return false;
    await this.signInDemo(persona);
    return true;
  };
  signInDemo = async (persona: Persona) => {
    this.persona = persona;
    storage.set(persona);
    this.build();
  };
  startEmailSignIn: Api["startEmailSignIn"] = async () =>
    Promise.reject(new ApiError(501, "Not available in the demo"));
  verifyEmailSignIn: Api["verifyEmailSignIn"] = async () =>
    Promise.reject(new ApiError(501, "Not available in the demo"));
  signInWithIdToken: Api["signInWithIdToken"] = async () =>
    Promise.reject(new ApiError(501, "Not available in the demo"));
  signOut = async () => {
    this.persona = null;
    storage.set(null);
  };

  // --- me -----------------------------------------------------------------------------------------

  me = async (): Promise<MeDto> => {
    const coach = this.persona === "coach";
    const a = this.me_();
    const identity: IdentityDto = {
      id: "id-1",
      provider: "google",
      email: coach ? COACH.email : a.email,
      createdAt: "2026-09-01T08:00:00.000Z",
    };
    return this.delay({
      user: {
        id: coach ? COACH.id : a.id,
        email: identity.email,
        displayName: a.name,
        roles: [...(coach ? this.coachRoles : this.athleteRoles)],
      },
      identities: [identity],
      settings: a.settings,
    });
  };
  updateProfile = async (displayName: string) => {
    this.me_().name = displayName.trim();
    return (await this.me()).user;
  };
  updateSettings = async (patch: SettingsInput) => {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<AthleteSettings>;
    const a = this.me_();
    a.settings = { ...a.settings, ...clean };
    return (await this.me()).settings;
  };
  private roles(): ("athlete" | "coach")[] {
    return this.persona === "coach" ? this.coachRoles : this.athleteRoles;
  }
  addRole = async (role: "athlete" | "coach") => {
    const roles = this.roles();
    if (!roles.includes(role)) roles.push(role);
    return [...roles].sort();
  };
  removeRole = async (role: "athlete" | "coach") => {
    const roles = this.roles();
    if (roles.length > 1) roles.splice(roles.indexOf(role) >>> 0, roles.includes(role) ? 1 : 0);
    return [...roles].sort();
  };
  sessions = async (): Promise<SessionDto[]> =>
    this.delay([
      {
        id: "s-1",
        createdAt: this.now().toISOString(),
        lastUsedAt: this.now().toISOString(),
        expiresAt: this.now().toISOString(),
        userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
        current: true,
      },
    ]);
  revokeSession = async () => undefined;
  revokeOtherSessions = async () => 0;
  unlinkIdentity = async () =>
    Promise.reject(new ApiError(409, "The last sign-in method cannot be removed"));
  startEmailLink = async () => Promise.reject(new ApiError(501, "Not available in the demo"));
  verifyEmailLink = async () => Promise.reject(new ApiError(501, "Not available in the demo"));
  deleteAccount = async () => {
    await this.signOut();
  };

  // --- training -----------------------------------------------------------------------------------

  private calendarFor(
    a: DemoAthlete,
    from: LocalDate,
    to: LocalDate,
    visible: boolean,
  ): CalendarDto {
    return calendarView({
      athleteId: a.id,
      from,
      to,
      entries: a.entries
        .filter((e) => e.calendarDate >= from && e.calendarDate <= to)
        .sort((x, y) => x.calendarDate.localeCompare(y.calendarDate) || x.sequence - y.sequence),
      activities: a.activities
        .filter((x) => x.calendarDate >= from && x.calendarDate <= to)
        .sort((x, y) => x.startTimeInSeconds - y.startTimeInSeconds),
      overrides: [],
      feedback: a.feedback,
      activitiesVisible: visible,
    });
  }

  private addPlan(a: DemoAthlete, input: PlanInput): PlanEntryDto {
    const entry: PlanEntryDto = {
      id: this.id("plan"),
      athleteId: a.id,
      calendarDate: input.calendarDate,
      kind: input.kind,
      description: input.description.trim(),
      plannedActivityType: input.plannedActivityType ?? null,
      plannedDistanceInMeters: input.plannedDistanceInMeters ?? null,
      plannedDurationInSeconds: input.plannedDurationInSeconds ?? null,
      notes: input.notes ?? null,
      sequence: input.sequence ?? 0,
      version: 1,
    };
    a.entries.push(entry);
    return entry;
  }

  private patchPlan(a: DemoAthlete, id: string, patch: PlanPatch): PlanEntryDto {
    const entry = a.entries.find((e) => e.id === id);
    if (!entry) throw new ApiError(404, "Plan entry not found");
    if (entry.version !== patch.expectedVersion) throw new ApiError(409, "Plan entry changed");
    const { expectedVersion: _v, ...fields } = patch;
    Object.assign(
      entry,
      Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      { version: entry.version + 1 },
    );
    return entry;
  }

  private removePlan(a: DemoAthlete, id: string): void {
    const before = a.entries.length;
    a.entries = a.entries.filter((e) => e.id !== id);
    if (a.entries.length === before) throw new ApiError(404, "Plan entry not found");
  }

  private addComment(a: DemoAthlete, authorId: string, input: CommentInput): CommentDto {
    const comment: CommentDto = {
      id: this.id("c"),
      athleteId: a.id,
      authorId,
      authorName: authorId === COACH.id ? this.name(COACH.id, COACH.name) : a.name,
      activityId: input.activityId ?? null,
      planEntryId: input.planEntryId ?? null,
      body: input.body.trim(),
      createdAt: this.now().toISOString(),
    };
    a.comments.unshift(comment);
    return comment;
  }

  weather = async () => this.delay(buildDemoWeather());
  wellness = async (date: LocalDate) =>
    this.delay(this.me_().wellness.find((w) => w.calendarDate === date) ?? null);
  calendar = async (from: LocalDate, to: LocalDate) =>
    this.delay(this.calendarFor(this.me_(), from, to, true));
  createPlan = async (input: PlanInput) => this.delay(this.addPlan(this.me_(), input));
  updatePlan = async (id: string, patch: PlanPatch) =>
    this.delay(this.patchPlan(this.me_(), id, patch));
  deletePlan = async (id: string) => this.removePlan(this.me_(), id);
  activities = async (from: LocalDate, to: LocalDate) =>
    this.delay(
      this.calendarFor(this.me_(), from, to, true).activities.sort(
        (x, y) => y.startTimeInSeconds - x.startTimeInSeconds,
      ),
    );
  activity = async (id: string) => {
    const a = this.me_();
    const found = a.activities.find((x) => x.id === id);
    if (!found) return Promise.reject(new ApiError(404, "Activity not found"));
    const day = this.calendarFor(a, found.calendarDate, found.calendarDate, true);
    const link = day.links.find((l) => l.activityId === id);
    const planEntry = day.entries.find((e) => e.id === link?.planEntryId) ?? null;
    const outdoors = found.distanceInMeters && found.activityType !== "TREADMILL_RUNNING";
    return this.delay({
      activity: day.activities.find((x) => x.id === id) as ActivityDto,
      route: outdoors
        ? buildDemoRoute(found.distanceInMeters ?? 0, found.startTimeInSeconds)
        : null,
      planEntry,
      comments: a.comments.filter((c) => c.activityId === id),
      insights: activityInsights(found, a.activities, planEntry),
    });
  };
  saveFeedback = async (activityId: string, input: FeedbackInput) => {
    const a = this.me_();
    const fb: FeedbackDto = {
      ...input,
      comment: input.comment?.trim() || null,
      updatedAt: this.now().toISOString(),
    };
    a.feedback.set(activityId, fb);
    return this.delay(fb);
  };
  progress = async (weeks: number) =>
    this.delay(progressView(this.me_().activities, this.today(), weeks));
  coaches = async () => {
    const a = this.me_();
    if (!a.link) return this.delay([]);
    return this.delay([
      {
        linkId: a.link.id,
        coachId: COACH.id,
        coachName: this.name(COACH.id, COACH.name),
        status: a.link.status,
        scopes: [...a.link.scopes],
      },
    ]);
  };
  acceptCoach = async (_linkId: string, scopes: ConsentScope[]) => {
    const a = this.me_();
    if (a.link) a.link = { ...a.link, status: "active", scopes };
  };
  updateCoachScopes = async (_linkId: string, scopes: ConsentScope[]) => {
    const a = this.me_();
    if (a.link) a.link.scopes = [...scopes];
  };
  endCoach = async (_linkId?: string) => {
    this.me_().link = null;
  };
  comments = async () => this.delay(this.me_().comments);
  postComment = async (input: CommentInput) => {
    const a = this.me_();
    return this.delay(this.addComment(a, a.id, input));
  };

  // --- coach --------------------------------------------------------------------------------------

  coachAthletes = async (): Promise<CoachAthleteDto[]> => {
    this.me_();
    const today = this.today();
    const range = coachRowRange(today);
    const rows = [...this.athletes.values()]
      .flatMap((a) => (a.link ? [{ a, link: a.link }] : []))
      .map(({ a, link }) =>
        coachRowView({
          linkId: link.id,
          athleteId: a.id,
          displayName: a.name,
          status: link.status,
          scopes: link.scopes,
          primarySource: "garmin",
          today,
          ...(link.status === "active"
            ? {
                calendar: this.calendarFor(
                  a,
                  range.from,
                  range.to,
                  link.scopes.includes("activities"),
                ),
                lastComment: a.comments[0] ?? null,
              }
            : {}),
        }),
      )
      .sort(
        (x, y) => y.signals.length - x.signals.length || x.displayName.localeCompare(y.displayName),
      );
    return this.delay(rows);
  };
  inviteAthlete = async (email: string) => {
    const name = email.split("@")[0] ?? email;
    const id = this.id("demo-invited");
    this.athletes.set(id, {
      id,
      name,
      email,
      settings: { ...DEFAULT_ATHLETE_SETTINGS },
      entries: [],
      activities: [],
      feedback: new Map(),
      wellness: [],
      link: { id: `link-${id}`, status: "invited", scopes: [] },
      comments: [],
    });
  };
  athleteCalendar = async (athleteId: string, from: LocalDate, to: LocalDate) => {
    const a = this.athlete(athleteId);
    return this.delay(this.calendarFor(a, from, to, this.shares(a)));
  };
  athleteProgress = async (athleteId: string, weeks: number) => {
    const a = this.athlete(athleteId);
    if (!this.shares(a))
      return Promise.reject(new ApiError(403, "The athlete has not shared activities"));
    return this.delay(progressView(a.activities, this.today(), weeks));
  };
  createAthletePlan = async (athleteId: string, input: PlanInput) =>
    this.delay(this.addPlan(this.athlete(athleteId), input));
  updateAthletePlan = async (athleteId: string, id: string, patch: PlanPatch) =>
    this.delay(this.patchPlan(this.athlete(athleteId), id, patch));
  deleteAthletePlan = async (athleteId: string, id: string) =>
    this.removePlan(this.athlete(athleteId), id);
  athleteComments = async (athleteId: string) => this.delay(this.athlete(athleteId).comments);
  postAthleteComment = async (athleteId: string, input: CommentInput) =>
    this.delay(this.addComment(this.athlete(athleteId), COACH.id, input));
  endAthlete = async (athleteId: string) => {
    const a = this.athletes.get(athleteId);
    if (!a?.link) throw new ApiError(404, "Athlete not found");
    a.link = null;
  };

  /** Test helper: the date the demo considers "today". */
  get todayDate(): LocalDate {
    return this.today();
  }

  /** Days relative to today, for tests and seeded content. */
  relative(days: number): LocalDate {
    return addDays(this.today(), days);
  }
}
