CREATE TYPE "public"."expense_category" AS ENUM('repair', 'salary', 'utility', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('Waiting for approval', 'Approved', 'Rejected');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_poisha" integer NOT NULL,
	"expense_date" date NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" text NOT NULL,
	"receipt_photo" text,
	"status" "expense_status" DEFAULT 'Waiting for approval' NOT NULL,
	"corrects_expense_id" uuid,
	"edit_note" text,
	"recorded_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_corrects_expense_id_expenses_id_fk" FOREIGN KEY ("corrects_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;