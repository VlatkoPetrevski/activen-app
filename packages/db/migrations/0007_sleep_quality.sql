ALTER TABLE "daily_wellness" DROP CONSTRAINT "daily_wellness_ranges_ck";--> statement-breakpoint
ALTER TABLE "daily_wellness" ADD COLUMN "sleep_quality" smallint;--> statement-breakpoint
ALTER TABLE "daily_wellness" ADD CONSTRAINT "daily_wellness_ranges_ck" CHECK (("daily_wellness"."sleep_duration_s" is null or "daily_wellness"."sleep_duration_s" between 0 and 86400)
        and ("daily_wellness"."sleep_score" is null or "daily_wellness"."sleep_score" between 0 and 100)
        and ("daily_wellness"."sleep_quality" is null or "daily_wellness"."sleep_quality" between 1 and 5)
        and ("daily_wellness"."resting_hr" is null or "daily_wellness"."resting_hr" between 20 and 200)
        and ("daily_wellness"."hrv_ms" is null or "daily_wellness"."hrv_ms" between 0 and 500)
        and ("daily_wellness"."vendor_readiness" is null or "daily_wellness"."vendor_readiness" between 0 and 100));