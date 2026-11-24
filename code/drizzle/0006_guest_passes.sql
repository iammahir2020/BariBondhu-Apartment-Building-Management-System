CREATE TABLE "guest_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occupancy_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"guest_count" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"code" text NOT NULL,
	"guests_used" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_passes_guest_name_not_blank" CHECK (length(trim("guest_passes"."guest_name")) > 0),
	CONSTRAINT "guest_passes_guest_count_1_to_20" CHECK ("guest_passes"."guest_count" between 1 and 20),
	CONSTRAINT "guest_passes_window_up_to_24_hours" CHECK ("guest_passes"."ends_at" > "guest_passes"."starts_at" and "guest_passes"."ends_at" <= "guest_passes"."starts_at" + interval '24 hours'),
	CONSTRAINT "guest_passes_code_6_digits" CHECK ("guest_passes"."code" ~ '^[0-9]{6}$'),
	CONSTRAINT "guest_passes_guests_used_in_range" CHECK ("guest_passes"."guests_used" between 0 and "guest_passes"."guest_count")
);
--> statement-breakpoint
ALTER TABLE "guest_passes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_occupancy_id_occupancies_id_fk" FOREIGN KEY ("occupancy_id") REFERENCES "public"."occupancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_passes_code_idx" ON "guest_passes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "guest_passes_occupancy_idx" ON "guest_passes" USING btree ("occupancy_id");