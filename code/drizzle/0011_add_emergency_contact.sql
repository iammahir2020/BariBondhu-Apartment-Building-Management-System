CREATE TABLE "emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"phone" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_contacts" ENABLE ROW LEVEL SECURITY;