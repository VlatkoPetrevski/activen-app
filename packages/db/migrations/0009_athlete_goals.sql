CREATE TABLE "athlete_goals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"race_date" date,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_goals_text_ck" CHECK (char_length("athlete_goals"."text") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "athlete_goals" ADD CONSTRAINT "athlete_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_goals" ADD CONSTRAINT "athlete_goals_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;