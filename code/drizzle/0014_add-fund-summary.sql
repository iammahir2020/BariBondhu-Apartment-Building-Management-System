CREATE TYPE "public"."opening_balance_status" AS ENUM('Waiting for approval', 'Approved', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."fund_summary_status" AS ENUM('Draft', 'Published', 'Revised');--> statement-breakpoint
CREATE TABLE "opening_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"amount_poisha" integer NOT NULL,
	"note" text,
	"status" "opening_balance_status" DEFAULT 'Waiting for approval' NOT NULL,
	"entered_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balances_month_unique" UNIQUE("month")
);
--> statement-breakpoint
ALTER TABLE "opening_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fund_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"opening_balance_poisha" integer NOT NULL,
	"total_collected_poisha" integer NOT NULL,
	"spent_repair_poisha" integer NOT NULL,
	"spent_salary_poisha" integer NOT NULL,
	"spent_utility_poisha" integer NOT NULL,
	"spent_other_poisha" integer NOT NULL,
	"closing_balance_poisha" integer NOT NULL,
	"total_outstanding_poisha" integer NOT NULL,
	"status" "fund_summary_status" DEFAULT 'Draft' NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_summaries_month_unique" UNIQUE("month")
);
--> statement-breakpoint
ALTER TABLE "fund_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_entered_by_profiles_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_summaries" ADD CONSTRAINT "fund_summaries_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;