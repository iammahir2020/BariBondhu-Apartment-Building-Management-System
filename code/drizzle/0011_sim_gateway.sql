CREATE TYPE "public"."gateway_payment_state" AS ENUM('Pending', 'Succeeded', 'Failed', 'Cancelled');--> statement-breakpoint
CREATE TABLE "gateway_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"amount_poisha" integer NOT NULL,
	"state" "gateway_payment_state" DEFAULT 'Pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "gateway_transactions_amount_positive" CHECK ("gateway_transactions"."amount_poisha" > 0),
	CONSTRAINT "gateway_transactions_decided_when_not_pending" CHECK (("gateway_transactions"."state" = 'Pending') = ("gateway_transactions"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "gateway_transactions" ENABLE ROW LEVEL SECURITY;