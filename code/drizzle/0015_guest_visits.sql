CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_pass_id" uuid NOT NULL,
	"guests_in" integer NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"guard_id" uuid NOT NULL,
	"entered_later" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_guests_in_positive" CHECK ("visits"."guests_in" > 0)
);
--> statement-breakpoint
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "visit_exits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"guests_out" integer NOT NULL,
	"exited_at" timestamp with time zone NOT NULL,
	"guard_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_exits_guests_out_positive" CHECK ("visit_exits"."guests_out" > 0)
);
--> statement-breakpoint
ALTER TABLE "visit_exits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_guest_pass_id_guest_passes_id_fk" FOREIGN KEY ("guest_pass_id") REFERENCES "public"."guest_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_guard_id_profiles_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_exits" ADD CONSTRAINT "visit_exits_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_exits" ADD CONSTRAINT "visit_exits_guard_id_profiles_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_guest_pass_idx" ON "visits" USING btree ("guest_pass_id");--> statement-breakpoint
CREATE INDEX "visits_guard_idx" ON "visits" USING btree ("guard_id");--> statement-breakpoint
CREATE INDEX "visits_entered_at_idx" ON "visits" USING btree ("entered_at");--> statement-breakpoint
CREATE INDEX "visit_exits_visit_idx" ON "visit_exits" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "visit_exits_guard_idx" ON "visit_exits" USING btree ("guard_id");--> statement-breakpoint
CREATE INDEX "visit_exits_exited_at_idx" ON "visit_exits" USING btree ("exited_at");