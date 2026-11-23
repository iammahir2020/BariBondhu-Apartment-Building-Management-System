CREATE TYPE "public"."announcement_audience" AS ENUM('All', 'Block', 'Floor');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('Published', 'Removed');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"audience" "announcement_audience" DEFAULT 'All' NOT NULL,
	"target_block_id" uuid,
	"target_floor" integer,
	"urgent" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "announcement_status" DEFAULT 'Published' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_title_not_blank" CHECK (length(trim("announcements"."title")) > 0),
	CONSTRAINT "announcements_message_not_blank" CHECK (length(trim("announcements"."message")) > 0),
	CONSTRAINT "announcements_audience_target" CHECK ((
        ("announcements"."audience" = 'All'
          AND "announcements"."target_block_id" IS NULL
          AND "announcements"."target_floor" IS NULL)
        OR
        ("announcements"."audience" = 'Block'
          AND "announcements"."target_block_id" IS NOT NULL
          AND "announcements"."target_floor" IS NULL)
        OR
        ("announcements"."audience" = 'Floor'
          AND "announcements"."target_block_id" IS NULL
          AND "announcements"."target_floor" IS NOT NULL)
      )),
	CONSTRAINT "announcements_urgent_expiry" CHECK (NOT "announcements"."urgent"
          OR "announcements"."expires_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_target_block_id_blocks_id_fk" FOREIGN KEY ("target_block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "announcements_audience_idx" ON "announcements" USING btree ("audience");