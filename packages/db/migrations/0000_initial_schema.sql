CREATE TYPE "public"."auth_provider" AS ENUM('google', 'apple', 'email');--> statement-breakpoint
CREATE TYPE "public"."coach_link_status" AS ENUM('invited', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."consent_scope" AS ENUM('activities', 'sleep_recovery', 'location', 'comments');--> statement-breakpoint
CREATE TYPE "public"."hr_zone_mode" AS ENUM('source', 'vendor', 'manual');--> statement-breakpoint
CREATE TYPE "public"."plan_kind" AS ENUM('workout', 'rest');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('athlete', 'coach', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'processing', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."vendor" AS ENUM('strava', 'garmin', 'polar', 'suunto', 'coros', 'wahoo', 'apple_health', 'google_health', 'manual');--> statement-breakpoint
CREATE TABLE "activity_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"perceived_effort" smallint,
	"feel" smallint,
	"comment" text,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_feedback_effort_ck" CHECK ("activity_feedback"."perceived_effort" is null or "activity_feedback"."perceived_effort" between 1 and 10),
	CONSTRAINT "activity_feedback_feel_ck" CHECK ("activity_feedback"."feel" is null or "activity_feedback"."feel" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "athlete_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" text,
	"unit_system" "unit_system" DEFAULT 'metric' NOT NULL,
	"time_zone" text DEFAULT 'Europe/Skopje' NOT NULL,
	"source_priority" "vendor"[] NOT NULL,
	"hr_zone_mode" "hr_zone_mode" DEFAULT 'source' NOT NULL,
	"hr_zone_vendor" "vendor",
	"max_heart_rate" smallint,
	"birth_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_settings_hr_zone_vendor_ck" CHECK (("athlete_settings"."hr_zone_mode" = 'vendor') = ("athlete_settings"."hr_zone_vendor" is not null) and "athlete_settings"."hr_zone_vendor" is distinct from 'manual'),
	CONSTRAINT "athlete_settings_max_hr_ck" CHECK ("athlete_settings"."max_heart_rate" is null or "athlete_settings"."max_heart_rate" between 100 and 250)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"subject_user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"status" "coach_link_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "coach_athletes_not_self_ck" CHECK ("coach_athletes"."coach_id" <> "coach_athletes"."athlete_id")
);
--> statement-breakpoint
CREATE TABLE "consent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_athlete_id" uuid NOT NULL,
	"scope" "consent_scope" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_translations" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_translations_entity_type_entity_id_field_locale_pk" PRIMARY KEY("entity_type","entity_id","field","locale")
);
--> statement-breakpoint
CREATE TABLE "hr_zone_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "vendor" NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"zones" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"calendar_date" date NOT NULL,
	"kind" "plan_kind" NOT NULL,
	"description" text NOT NULL,
	"planned_activity_type" text,
	"planned_distance_in_meters" double precision,
	"planned_duration_in_seconds" integer,
	"notes" text,
	"language" text,
	"sequence" smallint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_entry_versions" (
	"plan_entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_entry_versions_plan_entry_id_version_pk" PRIMARY KEY("plan_entry_id","version")
);
--> statement-breakpoint
CREATE TABLE "plan_link_overrides" (
	"plan_entry_id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor" "vendor" NOT NULL,
	"external_id" text NOT NULL,
	"activity_name" text NOT NULL,
	"activity_type" text NOT NULL,
	"calendar_date" date NOT NULL,
	"start_time_in_seconds" bigint NOT NULL,
	"start_time_offset_in_seconds" integer DEFAULT 0 NOT NULL,
	"duration_in_seconds" integer NOT NULL,
	"moving_duration_in_seconds" integer,
	"distance_in_meters" double precision,
	"total_elevation_gain_in_meters" double precision,
	"training_load" double precision,
	"average_heart_rate_in_beats_per_minute" double precision,
	"max_heart_rate_in_beats_per_minute" double precision,
	"average_power_in_watts" double precision,
	"active_kilocalories" double precision,
	"gear_name" text,
	"is_race" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_activities_duration_ck" CHECK ("source_activities"."duration_in_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" "vendor" NOT NULL,
	"object_id" text NOT NULL,
	"aspect" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor" "vendor" NOT NULL,
	"external_user_id" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"access_token_enc" "bytea",
	"refresh_token_enc" "bytea",
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "activity_feedback" ADD CONSTRAINT "activity_feedback_activity_id_source_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."source_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feedback" ADD CONSTRAINT "activity_feedback_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD CONSTRAINT "athlete_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_coach_athlete_id_coach_athletes_id_fk" FOREIGN KEY ("coach_athlete_id") REFERENCES "public"."coach_athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_zone_profiles" ADD CONSTRAINT "hr_zone_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entry_versions" ADD CONSTRAINT "plan_entry_versions_plan_entry_id_plan_entries_id_fk" FOREIGN KEY ("plan_entry_id") REFERENCES "public"."plan_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entry_versions" ADD CONSTRAINT "plan_entry_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_link_overrides" ADD CONSTRAINT "plan_link_overrides_plan_entry_id_plan_entries_id_fk" FOREIGN KEY ("plan_entry_id") REFERENCES "public"."plan_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_link_overrides" ADD CONSTRAINT "plan_link_overrides_activity_id_source_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."source_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_link_overrides" ADD CONSTRAINT "plan_link_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_activities" ADD CONSTRAINT "source_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_connections" ADD CONSTRAINT "vendor_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_feedback_activity_uq" ON "activity_feedback" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_uq" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_athletes_open_uq" ON "coach_athletes" USING btree ("coach_id","athlete_id") WHERE "coach_athletes"."status" <> 'ended';--> statement-breakpoint
CREATE UNIQUE INDEX "consent_grants_active_uq" ON "consent_grants" USING btree ("coach_athlete_id","scope") WHERE "consent_grants"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "hr_zone_profiles_user_source_version_uq" ON "hr_zone_profiles" USING btree ("user_id","source","version");--> statement-breakpoint
CREATE INDEX "plan_entries_athlete_date_idx" ON "plan_entries" USING btree ("athlete_id","calendar_date");--> statement-breakpoint
CREATE UNIQUE INDEX "source_activities_vendor_external_uq" ON "source_activities" USING btree ("vendor","external_id");--> statement-breakpoint
CREATE INDEX "source_activities_user_date_idx" ON "source_activities" USING btree ("user_id","calendar_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_events_idempotency_uq" ON "sync_events" USING btree ("vendor","object_id","aspect","event_time");--> statement-breakpoint
CREATE INDEX "sync_events_pending_idx" ON "sync_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_connections_user_vendor_uq" ON "vendor_connections" USING btree ("user_id","vendor");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_connections_vendor_external_uq" ON "vendor_connections" USING btree ("vendor","external_user_id");