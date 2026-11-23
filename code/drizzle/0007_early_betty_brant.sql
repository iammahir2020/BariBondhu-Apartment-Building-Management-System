CREATE TYPE "public"."bill_status" AS ENUM('Unpaid', 'Payment pending', 'Awaiting verification', 'Paid', 'Carried forward');--> statement-breakpoint
CREATE TYPE "public"."bill_line_item_type" AS ENUM('service', 'generator', 'water', 'carried_forward', 'adjustment');--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flat_id" uuid NOT NULL,
	"occupancy_id" uuid,
	"billing_month" date NOT NULL,
	"due_date" date NOT NULL,
	"total_poisha" integer DEFAULT 0 NOT NULL,
	"status" "bill_status" DEFAULT 'Unpaid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_flat_month_unique" UNIQUE("flat_id","billing_month"),
	CONSTRAINT "bills_due_date_valid" CHECK ("bills"."due_date" >= "bills"."billing_month"),
	CONSTRAINT "bills_month_first_day" CHECK (EXTRACT(DAY FROM "bills"."billing_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"type" "bill_line_item_type" NOT NULL,
	"amount_poisha" integer NOT NULL,
	"description" text,
	"source_bill_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_line_items_adjustment_reason" CHECK ("bill_line_items"."type" <> 'adjustment' OR
        ("bill_line_items"."description" IS NOT NULL AND length(trim("bill_line_items"."description")) > 0)),
	CONSTRAINT "bill_line_items_carried_source" CHECK ("bill_line_items"."type" <> 'carried_forward' OR "bill_line_items"."source_bill_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "bill_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_occupancy_id_occupancies_id_fk" FOREIGN KEY ("occupancy_id") REFERENCES "public"."occupancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_source_bill_id_bills_id_fk" FOREIGN KEY ("source_bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_status_idx" ON "bills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bills_occupancy_idx" ON "bills" USING btree ("occupancy_id");--> statement-breakpoint
CREATE INDEX "bill_line_items_bill_idx" ON "bill_line_items" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_line_items_source_bill_idx" ON "bill_line_items" USING btree ("source_bill_id");