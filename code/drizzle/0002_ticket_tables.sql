CREATE TYPE "public"."ticket_category" AS ENUM('Plumbing', 'Electrical', 'Lift', 'Water supply', 'Fire or gas smell', 'Other');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('Urgent', 'High', 'Normal');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('Reported', 'Assigned', 'In progress', 'On hold', 'Fixed', 'Closed', 'Cancelled', 'Duplicate', 'Won''t fix');--> statement-breakpoint
CREATE TABLE "common_area_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "common_area_places_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "common_area_places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by_id" uuid NOT NULL,
	"occupancy_id" uuid,
	"category" "ticket_category" NOT NULL,
	"flat_id" uuid,
	"place_id" uuid,
	"title" text,
	"description" text NOT NULL,
	"photo_path" text,
	"home_times" text,
	"status" "ticket_status" DEFAULT 'Reported' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'Normal' NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"instructions" text,
	"found_by_staff" boolean DEFAULT false NOT NULL,
	"linked_ticket_id" uuid,
	"duplicate_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_flat_or_place" CHECK (("tickets"."flat_id" is null) <> ("tickets"."place_id" is null)),
	CONSTRAINT "tickets_description_not_blank" CHECK (length(trim("tickets"."description")) > 0),
	CONSTRAINT "tickets_resident_or_staff_reporter" CHECK ("tickets"."found_by_staff" = ("tickets"."occupancy_id" is null)),
	CONSTRAINT "tickets_found_by_staff_is_linked" CHECK (not "tickets"."found_by_staff" or "tickets"."linked_ticket_id" is not null),
	CONSTRAINT "tickets_assigned_has_worker_and_due_date" CHECK ("tickets"."status" in ('Reported', 'Cancelled', 'Duplicate', 'Won''t fix') or ("tickets"."assignee_id" is not null and "tickets"."due_date" is not null)),
	CONSTRAINT "tickets_duplicate_has_original" CHECK (("tickets"."status" = 'Duplicate') = ("tickets"."duplicate_of_id" is not null)),
	CONSTRAINT "tickets_not_duplicate_of_itself" CHECK ("tickets"."duplicate_of_id" <> "tickets"."id")
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_followers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"occupancy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_followers_ticketId_occupancyId_unique" UNIQUE("ticket_id","occupancy_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_followers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_status" "ticket_status",
	"to_status" "ticket_status" NOT NULL,
	"changed_by_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_id_profiles_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_occupancy_id_occupancies_id_fk" FOREIGN KEY ("occupancy_id") REFERENCES "public"."occupancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_place_id_common_area_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."common_area_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_linked_ticket_id_tickets_id_fk" FOREIGN KEY ("linked_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_duplicate_of_id_tickets_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_occupancy_id_occupancies_id_fk" FOREIGN KEY ("occupancy_id") REFERENCES "public"."occupancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_status_changes" ADD CONSTRAINT "ticket_status_changes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_status_changes" ADD CONSTRAINT "ticket_status_changes_changed_by_id_profiles_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tickets_place_category_idx" ON "tickets" USING btree ("place_id","category");--> statement-breakpoint
CREATE INDEX "tickets_occupancy_idx" ON "tickets" USING btree ("occupancy_id");--> statement-breakpoint
CREATE INDEX "ticket_status_changes_ticket_idx" ON "ticket_status_changes" USING btree ("ticket_id");