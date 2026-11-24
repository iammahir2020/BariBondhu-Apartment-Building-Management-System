CREATE TYPE "public"."shift_status" AS ENUM('Planned', 'On duty', 'Finished', 'Removed');--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "shift_status" DEFAULT 'Planned' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_guard_id_profiles_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shifts_guard_idx" ON "shifts" USING btree ("guard_id");