CREATE TYPE "public"."import_status" AS ENUM('imported', 'duplicate', 'failed');--> statement-breakpoint
CREATE TABLE "activity_details" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"laps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"streams" jsonb,
	"route" jsonb,
	"device" jsonb,
	"exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"format" text,
	"file_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text,
	"status" "import_status" NOT NULL,
	"activity_id" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_details" ADD CONSTRAINT "activity_details_activity_id_source_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."source_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_files" ADD CONSTRAINT "activity_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_files" ADD CONSTRAINT "activity_files_activity_id_source_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."source_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_files_user_sha_idx" ON "activity_files" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "activity_files_user_created_idx" ON "activity_files" USING btree ("user_id","created_at");