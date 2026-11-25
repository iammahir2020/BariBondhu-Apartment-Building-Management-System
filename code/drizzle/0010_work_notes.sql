CREATE TABLE "work_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_notes_text_length" CHECK (length("work_notes"."text") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "work_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_notes" ADD CONSTRAINT "work_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_notes" ADD CONSTRAINT "work_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_notes_ticket_idx" ON "work_notes" USING btree ("ticket_id");