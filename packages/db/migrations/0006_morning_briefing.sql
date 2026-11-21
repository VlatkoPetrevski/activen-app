CREATE TABLE "daily_wellness" (
	"user_id" uuid NOT NULL,
	"calendar_date" date NOT NULL,
	"source" "vendor" NOT NULL,
	"sleep_duration_s" integer,
	"sleep_score" smallint,
	"resting_hr" smallint,
	"hrv_ms" double precision,
	"vendor_readiness" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_wellness_user_id_calendar_date_source_pk" PRIMARY KEY("user_id","calendar_date","source"),
	CONSTRAINT "daily_wellness_ranges_ck" CHECK (("daily_wellness"."sleep_duration_s" is null or "daily_wellness"."sleep_duration_s" between 0 and 86400)
        and ("daily_wellness"."sleep_score" is null or "daily_wellness"."sleep_score" between 0 and 100)
        and ("daily_wellness"."resting_hr" is null or "daily_wellness"."resting_hr" between 20 and 200)
        and ("daily_wellness"."hrv_ms" is null or "daily_wellness"."hrv_ms" between 0 and 500)
        and ("daily_wellness"."vendor_readiness" is null or "daily_wellness"."vendor_readiness" between 0 and 100))
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"calendar_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_user_id_kind_calendar_date_pk" PRIMARY KEY("user_id","kind","calendar_date")
);
--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD COLUMN "sleep_need_minutes" smallint DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD COLUMN "briefing_reminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD COLUMN "briefing_time" text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_wellness" ADD CONSTRAINT "daily_wellness_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD CONSTRAINT "athlete_settings_sleep_need_ck" CHECK ("athlete_settings"."sleep_need_minutes" between 300 and 720);--> statement-breakpoint
ALTER TABLE "athlete_settings" ADD CONSTRAINT "athlete_settings_briefing_time_ck" CHECK ("athlete_settings"."briefing_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');