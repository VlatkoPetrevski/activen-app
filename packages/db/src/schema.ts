/**
 * ActiveN PostgreSQL schema. Column names are snake_case; TypeScript properties follow the domain
 * (Garmin) vocabulary. Timestamps are `timestamptz`; calendar dates are `date` in the athlete's
 * timezone; vendor instants keep Garmin's Unix seconds.
 */
import { VENDORS, type WorkoutStructure } from "@activen/domain";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** A `timestamptz not null default now()` column; the name defaults to `created_at`. */
const createdAt = (name = "created_at") =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();

// --- Enums ----------------------------------------------------------------------------------------

export const vendorEnum = pgEnum("vendor", VENDORS);
export const authProviderEnum = pgEnum("auth_provider", ["google", "apple", "email"]);
export const roleEnum = pgEnum("role", ["athlete", "coach", "admin"]);
export const unitSystemEnum = pgEnum("unit_system", ["metric", "imperial"]);
export const hrZoneModeEnum = pgEnum("hr_zone_mode", ["source", "vendor", "manual"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "revoked", "error"]);
export const planKindEnum = pgEnum("plan_kind", ["workout", "rest"]);
export const coachLinkStatusEnum = pgEnum("coach_link_status", ["invited", "active", "ended"]);
export const consentScopeEnum = pgEnum("consent_scope", [
  "activities",
  "sleep_recovery",
  "location",
  "comments",
]);
export const loginTokenPurposeEnum = pgEnum("login_token_purpose", ["sign_in", "link"]);
export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "processing",
  "processed",
  "failed",
  "skipped",
]);

// --- Identity -------------------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_uq")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** One row per external login (Google `sub`, Apple `sub`, verified email). */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("auth_identities_provider_subject_uq").on(t.provider, t.providerSubject),
    index("auth_identities_user_idx").on(t.userId),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/**
 * A signed-in device/browser. Refresh tokens rotate within a session; revoking the session signs the
 * device out. `expires_at` is the absolute lifetime (re-authentication required afterwards).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    lastUsedAt: createdAt("last_used_at"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    /** Short device label for the "signed-in devices" list (truncated User-Agent). */
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Refresh tokens are stored only as SHA-256 hashes; a used token is never valid again. */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    issuedAt: createdAt("issued_at"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash),
    index("refresh_tokens_session_idx").on(t.sessionId),
  ],
);

/** Single-use email magic-link tokens (hash only), for sign-in or for linking an email to a user. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: id(),
    tokenHash: bytea("token_hash").notNull(),
    email: text("email").notNull(),
    purpose: loginTokenPurposeEnum("purpose").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("login_tokens_hash_uq").on(t.tokenHash),
    index("login_tokens_email_idx").on(t.email, t.createdAt),
    check("login_tokens_link_user_ck", sql`(${t.purpose} = 'link') = (${t.userId} is not null)`),
  ],
);

/** AthleteSettings (domain/athlete-settings.ts). One row per user; missing row = defaults. */
export const athleteSettings = pgTable(
  "athlete_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    locale: text("locale"),
    unitSystem: unitSystemEnum("unit_system").notNull().default("metric"),
    timeZone: text("time_zone").notNull().default("Europe/Skopje"),
    sourcePriority: vendorEnum("source_priority").array().notNull(),
    hrZoneMode: hrZoneModeEnum("hr_zone_mode").notNull().default("source"),
    hrZoneVendor: vendorEnum("hr_zone_vendor"),
    maxHeartRate: smallint("max_heart_rate"),
    birthDate: date("birth_date", { mode: "string" }),
    workoutSuggestions: boolean("workout_suggestions").notNull().default(true),
    sleepNeedMinutes: smallint("sleep_need_minutes").notNull().default(480),
    briefingReminder: boolean("briefing_reminder").notNull().default(false),
    briefingTime: text("briefing_time").notNull().default("07:00"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("athlete_settings_sleep_need_ck", sql`${t.sleepNeedMinutes} between 300 and 720`),
    check(
      "athlete_settings_briefing_time_ck",
      sql`${t.briefingTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check(
      "athlete_settings_hr_zone_vendor_ck",
      sql`(${t.hrZoneMode} = 'vendor') = (${t.hrZoneVendor} is not null) and ${t.hrZoneVendor} is distinct from 'manual'`,
    ),
    check(
      "athlete_settings_max_hr_ck",
      sql`${t.maxHeartRate} is null or ${t.maxHeartRate} between 100 and 250`,
    ),
  ],
);

// --- Vendor data ----------------------------------------------------------------------------------

/** OAuth connection to a vendor. Tokens are encrypted by the application (envelope encryption). */
export const vendorConnections = pgTable(
  "vendor_connections",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vendor: vendorEnum("vendor").notNull(),
    externalUserId: text("external_user_id").notNull(),
    status: connectionStatusEnum("status").notNull().default("active"),
    accessTokenEnc: bytea("access_token_enc"),
    refreshTokenEnc: bytea("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    connectedAt: createdAt("connected_at"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("vendor_connections_user_vendor_uq").on(t.userId, t.vendor),
    uniqueIndex("vendor_connections_vendor_external_uq").on(t.vendor, t.externalUserId),
  ],
);

/** Raw activity per source, in Garmin vocabulary. Merging across sources is computed, not stored. */
export const sourceActivities = pgTable(
  "source_activities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vendor: vendorEnum("vendor").notNull(),
    externalId: text("external_id").notNull(),
    activityName: text("activity_name").notNull(),
    activityType: text("activity_type").notNull(),
    calendarDate: date("calendar_date", { mode: "string" }).notNull(),
    startTimeInSeconds: bigint("start_time_in_seconds", { mode: "number" }).notNull(),
    startTimeOffsetInSeconds: integer("start_time_offset_in_seconds").notNull().default(0),
    durationInSeconds: integer("duration_in_seconds").notNull(),
    movingDurationInSeconds: integer("moving_duration_in_seconds"),
    distanceInMeters: doublePrecision("distance_in_meters"),
    totalElevationGainInMeters: doublePrecision("total_elevation_gain_in_meters"),
    trainingLoad: doublePrecision("training_load"),
    averageHeartRateInBeatsPerMinute: doublePrecision("average_heart_rate_in_beats_per_minute"),
    maxHeartRateInBeatsPerMinute: doublePrecision("max_heart_rate_in_beats_per_minute"),
    averagePowerInWatts: doublePrecision("average_power_in_watts"),
    activeKilocalories: doublePrecision("active_kilocalories"),
    gearName: text("gear_name"),
    isRace: boolean("is_race").notNull().default(false),
    deleted: boolean("deleted").notNull().default(false),
    /** Original vendor payload, kept for re-processing when mappings improve. */
    raw: jsonb("raw"),
    receivedAt: createdAt("received_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("source_activities_vendor_external_uq").on(t.vendor, t.externalId),
    index("source_activities_user_date_idx").on(t.userId, t.calendarDate),
    check("source_activities_duration_ck", sql`${t.durationInSeconds} >= 0`),
  ],
);

/**
 * What a detailed source (a FIT/GPX/TCX file, a vendor's activity file) adds to an activity:
 * laps, samples for charts, the simplified route, the recording device and strength sets.
 * One row per source activity; removed with it.
 */
export const activityDetails = pgTable("activity_details", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => sourceActivities.id, { onDelete: "cascade" }),
  laps: jsonb("laps")
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Column per channel, ≤1 Hz and ≤20 000 rows (see @activen/importers `thinStreams`). */
  streams: jsonb("streams"),
  /** Simplified GPS track as [lat, lon] pairs; shown only with the "location" consent. */
  route: jsonb("route"),
  device: jsonb("device"),
  exercises: jsonb("exercises")
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: updatedAt(),
});

export const importStatusEnum = pgEnum("import_status", ["imported", "duplicate", "failed"]);

/**
 * Every uploaded file and what became of it. The SHA-256 recognises a file uploaded again; the
 * original bytes are kept in the file store (`storage_key`) so activities can be re-read when
 * the importers improve, and are deleted with the account.
 */
export const activityFiles = pgTable(
  "activity_files",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sha256: text("sha256").notNull(),
    format: text("format"),
    fileName: text("file_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key"),
    status: importStatusEnum("status").notNull(),
    /** The activity created, or the existing one it duplicates. */
    activityId: uuid("activity_id").references(() => sourceActivities.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_files_user_sha_idx").on(t.userId, t.sha256),
    index("activity_files_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * Morning recovery data per day and source (domain/readiness.ts `WellnessRecord`). Vendors write
 * their own row; what the athlete types in the morning is the `manual` row. Merged on read.
 */
export const dailyWellness = pgTable(
  "daily_wellness",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarDate: date("calendar_date", { mode: "string" }).notNull(),
    source: vendorEnum("source").notNull(),
    sleepDurationInSeconds: integer("sleep_duration_s"),
    sleepScore: smallint("sleep_score"),
    /** The athlete's own rating of the night, 1–5 (morning input). */
    sleepQuality: smallint("sleep_quality"),
    restingHeartRate: smallint("resting_hr"),
    lastNightHrvMs: doublePrecision("hrv_ms"),
    vendorReadiness: smallint("vendor_readiness"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.calendarDate, t.source] }),
    check(
      "daily_wellness_ranges_ck",
      sql`(${t.sleepDurationInSeconds} is null or ${t.sleepDurationInSeconds} between 0 and 86400)
        and (${t.sleepScore} is null or ${t.sleepScore} between 0 and 100)
        and (${t.sleepQuality} is null or ${t.sleepQuality} between 1 and 5)
        and (${t.restingHeartRate} is null or ${t.restingHeartRate} between 20 and 200)
        and (${t.lastNightHrvMs} is null or ${t.lastNightHrvMs} between 0 and 500)
        and (${t.vendorReadiness} is null or ${t.vendorReadiness} between 0 and 100)`,
    ),
  ],
);

/** Sent notifications; the unique key makes each one at-most-once per user, kind and day. */
export const notificationLog = pgTable(
  "notification_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    calendarDate: date("calendar_date", { mode: "string" }).notNull(),
    sentAt: createdAt("sent_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.calendarDate] })],
);

/**
 * The athlete's goal in their own words ("маратон за 3:30"), with an optional race date. The
 * athlete or their coach writes it; paces are derived from the text, never stored.
 */
export const athleteGoals = pgTable(
  "athlete_goals",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    raceDate: date("race_date", { mode: "string" }),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [check("athlete_goals_text_ck", sql`char_length(${t.text}) between 1 and 300`)],
);

/** Immutable, versioned HR zone profiles (HR-04, HR-05). */
export const hrZoneProfiles = pgTable(
  "hr_zone_profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: vendorEnum("source").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    zones: jsonb("zones").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hr_zone_profiles_user_source_version_uq").on(t.userId, t.source, t.version)],
);

// --- Planning -------------------------------------------------------------------------------------

export const planEntries = pgTable(
  "plan_entries",
  {
    id: id(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarDate: date("calendar_date", { mode: "string" }).notNull(),
    kind: planKindEnum("kind").notNull(),
    description: text("description").notNull(),
    plannedActivityType: text("planned_activity_type"),
    plannedDistanceInMeters: doublePrecision("planned_distance_in_meters"),
    plannedDurationInSeconds: integer("planned_duration_in_seconds"),
    notes: text("notes"),
    /** Accepted workout steps (WorkoutStructure); the description stays the source of truth. */
    structure: jsonb("structure").$type<WorkoutStructure>(),
    /** BCP-47 language the description was written in (user content is not auto-translated). */
    language: text("language"),
    sequence: smallint("sequence").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("plan_entries_athlete_date_idx").on(t.athleteId, t.calendarDate)],
);

/** History of plan changes (PLAN-06): one snapshot per version. */
export const planEntryVersions = pgTable(
  "plan_entry_versions",
  {
    planEntryId: uuid("plan_entry_id")
      .notNull()
      .references(() => planEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: createdAt("changed_at"),
  },
  (t) => [primaryKey({ columns: [t.planEntryId, t.version] })],
);

/** Manual plan ↔ activity decision (matching rule 5); `activity_id` null = explicitly unlinked. */
export const planLinkOverrides = pgTable("plan_link_overrides", {
  planEntryId: uuid("plan_entry_id")
    .primaryKey()
    .references(() => planEntries.id, { onDelete: "cascade" }),
  activityId: uuid("activity_id").references(() => sourceActivities.id, { onDelete: "set null" }),
  setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
  setAt: createdAt("set_at"),
});

/**
 * The rating of an activity: perceived effort (1–10), feel (1–5), comment. From the watch when
 * the athlete rated it there, otherwise entered in ActiveN; the athlete's own entry wins.
 */
export const activityFeedback = pgTable(
  "activity_feedback",
  {
    id: id(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => sourceActivities.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    perceivedEffort: smallint("perceived_effort"),
    feel: smallint("feel"),
    comment: text("comment"),
    language: text("language"),
    /** `device`: rated on the watch and read from the file; `athlete`: entered in ActiveN. */
    source: text("source", { enum: ["athlete", "device"] })
      .notNull()
      .default("athlete"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("activity_feedback_activity_uq").on(t.activityId),
    check("activity_feedback_source_ck", sql`${t.source} in ('athlete', 'device')`),
    check(
      "activity_feedback_effort_ck",
      sql`${t.perceivedEffort} is null or ${t.perceivedEffort} between 1 and 10`,
    ),
    check("activity_feedback_feel_ck", sql`${t.feel} is null or ${t.feel} between 1 and 5`),
  ],
);

// --- Coaching -------------------------------------------------------------------------------------

export const coachAthletes = pgTable(
  "coach_athletes",
  {
    id: id(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: coachLinkStatusEnum("status").notNull().default("invited"),
    invitedAt: createdAt("invited_at"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("coach_athletes_open_uq")
      .on(t.coachId, t.athleteId)
      .where(sql`${t.status} <> 'ended'`),
    check("coach_athletes_not_self_ck", sql`${t.coachId} <> ${t.athleteId}`),
  ],
);

/** What a coach may see; granted and revoked by the athlete. */
export const consentGrants = pgTable(
  "consent_grants",
  {
    id: id(),
    coachAthleteId: uuid("coach_athlete_id")
      .notNull()
      .references(() => coachAthletes.id, { onDelete: "cascade" }),
    scope: consentScopeEnum("scope").notNull(),
    grantedAt: createdAt("granted_at"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("consent_grants_active_uq")
      .on(t.coachAthleteId, t.scope)
      .where(sql`${t.revokedAt} is null`),
  ],
);

// --- Sync, content, audit -------------------------------------------------------------------------

/** Incoming vendor events. The unique key makes processing idempotent (SYNC-05). */
export const syncEvents = pgTable(
  "sync_events",
  {
    id: id(),
    vendor: vendorEnum("vendor").notNull(),
    objectId: text("object_id").notNull(),
    aspect: text("aspect").notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    payload: jsonb("payload"),
    status: syncStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Set when a worker claims the event; a stale claim (crashed worker) expires after the lease. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastError: text("last_error"),
    receivedAt: createdAt("received_at"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sync_events_idempotency_uq").on(t.vendor, t.objectId, t.aspect, t.eventTime),
    index("sync_events_pending_idx").on(t.status, t.receivedAt),
  ],
);

/** Translations of ActiveN-authored content (templates, library, nutrition) — ADR-0008 §7. */
export const contentTranslations = pgTable(
  "content_translations",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    locale: text("locale").notNull(),
    text: text("text").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.field, t.locale] })],
);

/**
 * Conversation between an athlete and their coach: recommendations, replies, questions. Optionally
 * about one activity or plan entry. Both sides read the athlete's thread.
 */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => sourceActivities.id, { onDelete: "set null" }),
    planEntryId: uuid("plan_entry_id").references(() => planEntries.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    language: text("language"),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_athlete_idx").on(t.athleteId, t.createdAt),
    check("comments_body_ck", sql`length(${t.body}) between 1 and 4000`),
  ],
);

/** Who looked at whose data (coach access to athlete data, admin support). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: jsonb("details"),
    at: createdAt("at"),
  },
  (t) => [index("audit_log_subject_idx").on(t.subjectUserId, t.at)],
);
