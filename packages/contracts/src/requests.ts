/**
 * Request bodies and queries, validated on the server and reused by clients for forms.
 * Field names follow the domain (Garmin) vocabulary.
 */
import { ACTIVITY_TYPES, VENDORS, isLocalDate } from "@activen/domain";
import { z } from "zod";
import { CONSENT_SCOPES } from "./constants.js";
import { isStartTime } from "./imports.js";

const LOCALES = ["mk", "en"] as const;

export const localDate = z.string().refine(isLocalDate, "must be a date YYYY-MM-DD");
const uuid = z.uuid();

// --- Auth ----------------------------------------------------------------------------------------

/**
 * `web`: the refresh token lives only in an HttpOnly cookie (not readable by scripts).
 * `native`: the app stores it in the OS keychain, so it is returned in the body.
 */
export const ClientKind = z.enum(["web", "native"]).default("web");

export const IdTokenSignIn = z.object({
  idToken: z.string().min(20).max(8192),
  /** Random value the client generated for this sign-in and passed to Google/Apple. */
  nonce: z.string().min(16).max(256),
  /** Apple gives the name to the client only on the first sign-in. */
  displayName: z.string().max(100).optional(),
  client: ClientKind,
});
export const EmailStart = z.object({
  email: z.string().min(3).max(254),
  locale: z.string().max(35).optional(),
});
export const EmailVerify = z.object({ token: z.string().min(20).max(128), client: ClientKind });
export const RefreshBody = z.object({
  refreshToken: z.string().min(20).max(128).optional(),
  client: ClientKind,
});
export const LogoutBody = z.object({ refreshToken: z.string().min(20).max(128).optional() });

// --- Profile -------------------------------------------------------------------------------------

export const ProfilePatch = z.object({ displayName: z.string().min(1).max(100) });

type SourceVendor = Exclude<(typeof VENDORS)[number], "manual">;
const sourceVendors = VENDORS.filter((v) => v !== "manual") as [SourceVendor, ...SourceVendor[]];

/** Partial update of the athlete settings; omitted fields keep their value. */
export const SettingsPatch = z
  .object({
    locale: z.enum(LOCALES).nullable(),
    unitSystem: z.enum(["metric", "imperial"]),
    timeZone: z.string().min(1).max(64),
    sourcePriority: z.array(z.enum(VENDORS)).min(1).max(VENDORS.length),
    hrZones: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("source") }),
      z.object({ mode: z.literal("vendor"), vendor: z.enum(sourceVendors) }),
      z.object({ mode: z.literal("manual") }),
    ]),
    maxHeartRate: z.number().int().min(100).max(250).nullable(),
    birthDate: z.iso.date().nullable(),
    workoutSuggestions: z.boolean(),
    sleepNeedMinutes: z.number().int().min(300).max(720),
    briefingReminder: z
      .object({
        enabled: z.boolean(),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
      })
      .strict(),
  })
  .partial()
  .strict();

/**
 * The morning input when the watch has no night: roughly how long the athlete slept (a range,
 * sent as its middle) and how the night was (1–5). The resting pulse comes only from a device.
 * Null clears a value; both null removes the input for the day.
 */
export const MorningInput = z
  .object({
    sleepDurationInSeconds: z
      .number()
      .int()
      .min(0)
      .max(16 * 3600)
      .nullable(),
    sleepQuality: z.number().int().min(1).max(5).nullable().default(null),
  })
  .strict();

export const SelfServiceRole = z.enum(["athlete", "coach"]);
export const LinkIdToken = z.object({
  idToken: z.string().min(20).max(8192),
  nonce: z.string().min(16).max(256),
});
export const LinkEmailStart = z.object({
  email: z.string().min(3).max(254),
  locale: z.string().max(35).optional(),
});
export const LinkEmailVerify = z.object({ token: z.string().min(20).max(128) });
/** Deleting the account is confirmed by typing DELETE (the client asks explicitly). */
export const DeleteAccount = z.object({ confirm: z.literal("DELETE") });

// --- Calendar, plan, activities --------------------------------------------------------------------

const MAX_RANGE_DAYS = 400;

/** Inclusive date range; at most ~13 months per request. */
export const DateRange = z
  .object({ from: localDate, to: localDate })
  .refine((r) => r.from <= r.to, "from must not be after to")
  .refine(
    (r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= MAX_RANGE_DAYS,
    `range must be at most ${MAX_RANGE_DAYS} days`,
  );

/** `?date=` of the briefing; defaults to today in the athlete's timezone. */
export const BriefingQuery = z.object({ date: localDate.optional() }).strict();

const stepDuration = z.discriminatedUnion("type", [
  z.object({ type: z.literal("distance"), meters: z.number().min(1).max(500_000) }),
  z.object({ type: z.literal("time"), seconds: z.number().int().min(1).max(86_400) }),
  z.object({ type: z.literal("open") }),
]);
const stepTarget = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z
    .object({
      type: z.literal("pace"),
      /** Seconds per km; low is the faster end. */
      low: z.number().int().min(90).max(1200),
      high: z.number().int().min(90).max(1200),
    })
    .refine((p) => p.low <= p.high, "pace low must not be slower than high"),
  z.object({ type: z.literal("hr_zone"), zone: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal("label"), text: z.string().trim().min(1).max(60) }),
]);
const workoutStep = z.object({
  kind: z.literal("step"),
  intensity: z.enum(["warmup", "active", "recovery", "rest", "cooldown"]),
  duration: stepDuration,
  target: stepTarget,
});
/** A structured workout (Garmin Training API model), validated on the way in. */
export const WorkoutStructureSchema = z.object({
  items: z
    .array(
      z.discriminatedUnion("kind", [
        workoutStep,
        z.object({
          kind: z.literal("repeat"),
          count: z.number().int().min(1).max(50),
          steps: z.array(workoutStep).min(1).max(10),
        }),
      ]),
    )
    .min(1)
    .max(40),
  source: z.enum(["parser", "ai", "manual"]),
});

/** Text to structure: the coach's (or athlete's) plan description. */
export const WorkoutStructureRequest = z.object({
  text: z.string().trim().min(1).max(500),
  locale: z.string().max(10).optional(),
});

const planFields = {
  calendarDate: localDate,
  kind: z.enum(["workout", "rest"]),
  description: z.string().trim().min(1).max(500),
  plannedActivityType: z.enum(ACTIVITY_TYPES).nullable(),
  plannedDistanceInMeters: z.number().min(0).max(1_000_000).nullable(),
  plannedDurationInSeconds: z.number().int().min(0).max(172_800).nullable(),
  /** Coach's advice for this session ("first two intervals a bit slower…"). */
  notes: z.string().max(2000).nullable(),
  sequence: z.number().int().min(0).max(9),
  structure: WorkoutStructureSchema.nullable(),
};

export const PlanEntryCreate = z.object({
  ...planFields,
  plannedActivityType: planFields.plannedActivityType.default(null),
  plannedDistanceInMeters: planFields.plannedDistanceInMeters.default(null),
  plannedDurationInSeconds: planFields.plannedDurationInSeconds.default(null),
  notes: planFields.notes.default(null),
  sequence: planFields.sequence.default(0),
  structure: planFields.structure.default(null),
});

/** Changes to a plan entry; `expectedVersion` detects concurrent edits (409 on conflict). */
export const PlanEntryUpdate = z
  .object(planFields)
  .partial()
  .extend({ expectedVersion: z.number().int().min(1) })
  .strict();

/**
 * The athlete's own heart-rate zones: the lower bound (bpm) of zones 2–5, rising. Zone 1 is open
 * below and zone 5 open above, so every heart rate falls in a zone.
 */
export const HrZonesPut = z
  .object({
    lowerBounds: z
      .array(z.number().int().min(60).max(240))
      .length(4)
      .refine((b) => b.every((v, i) => i === 0 || v > (b[i - 1] ?? 0)), "bounds must rise"),
  })
  .strict();

const optionalNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();

/** A workout entered by hand; see ManualActivityInput. */
export const ManualActivityCreate = z
  .object({
    activityType: z.enum(ACTIVITY_TYPES),
    activityName: z.string().trim().min(1).max(100).nullable().default(null),
    date: localDate,
    startTime: z.string().refine(isStartTime, "must be a time HH:MM"),
    durationInSeconds: z
      .number()
      .int()
      .min(60)
      .max(48 * 3600),
    distanceInMeters: optionalNumber(0, 1_000_000).default(null),
    totalElevationGainInMeters: optionalNumber(0, 20_000).default(null),
    averageHeartRateInBeatsPerMinute: optionalNumber(30, 250).default(null),
    maxHeartRateInBeatsPerMinute: optionalNumber(30, 250).default(null),
    averagePowerInWatts: optionalNumber(0, 3000).default(null),
    activeKilocalories: optionalNumber(0, 20_000).default(null),
    perceivedEffort: z.number().int().min(1).max(10).nullable().default(null),
    feel: z.number().int().min(1).max(5).nullable().default(null),
    comment: z.string().max(2000).nullable().default(null),
  })
  .strict()
  .refine(
    (v) =>
      v.averageHeartRateInBeatsPerMinute === null ||
      v.maxHeartRateInBeatsPerMinute === null ||
      v.maxHeartRateInBeatsPerMinute >= v.averageHeartRateInBeatsPerMinute,
    { message: "max heart rate below the average", path: ["maxHeartRateInBeatsPerMinute"] },
  );

export const FeedbackPut = z.object({
  /** 1 very easy … 10 maximal. */
  perceivedEffort: z.number().int().min(1).max(10).nullable(),
  /** 1 very weak … 5 very strong. */
  feel: z.number().int().min(1).max(5).nullable(),
  comment: z.string().max(2000).nullable().default(null),
});

export const ProgressQuery = z.object({
  weeks: z.coerce.number().int().min(4).max(52).default(12),
});

// --- Coaching ------------------------------------------------------------------------------------

export const ConsentScopes = z.array(z.enum(CONSENT_SCOPES)).max(CONSENT_SCOPES.length);

export const CoachInvite = z.object({ email: z.string().min(3).max(254) });
export const AcceptInvite = z.object({ scopes: ConsentScopes });
export const UpdateConsent = z.object({ scopes: ConsentScopes });
export const CommentCreate = z.object({
  body: z.string().trim().min(1).max(4000),
  activityId: uuid.nullable().default(null),
  planEntryId: uuid.nullable().default(null),
});
