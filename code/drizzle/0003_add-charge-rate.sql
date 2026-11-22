CREATE TYPE "public"."charge_rate_status" AS ENUM('Current', 'Replaced');--> statement-breakpoint
CREATE TYPE "public"."charge_type" AS ENUM('service', 'generator', 'water');--> statement-breakpoint
CREATE TABLE "charge_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_type" charge_type NOT NULL,
	"amount_poisha" integer NOT NULL,
	"meeting_date" date NOT NULL,
	"set_by" uuid NOT NULL,
	"status" charge_rate_status DEFAULT 'Current' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charge_rates" ADD CONSTRAINT "charge_rates_set_by_profiles_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;