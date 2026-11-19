CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"author_id" uuid,
	"activity_id" uuid,
	"plan_entry_id" uuid,
	"body" text NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_ck" CHECK (length("comments"."body") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_activity_id_source_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."source_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_plan_entry_id_plan_entries_id_fk" FOREIGN KEY ("plan_entry_id") REFERENCES "public"."plan_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_athlete_idx" ON "comments" USING btree ("athlete_id","created_at");