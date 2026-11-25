CREATE TYPE "public"."overpayment_status" AS ENUM('Flagged', 'Refunded');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bill_id" uuid NOT NULL,
	"gateway_transaction_id" text NOT NULL,
	"amount_poisha" integer NOT NULL,
	"started_by_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "payments_gatewayTransactionId_unique" UNIQUE("gateway_transaction_id"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_poisha" > 0),
	CONSTRAINT "payments_confirmed_or_ended" CHECK ("payments"."confirmed_at" is null or "payments"."ended_at" is null),
	CONSTRAINT "payments_end_reason" CHECK (("payments"."ended_at" is null) = ("payments"."end_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "receipts_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bill_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_poisha" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "receipts_billId_unique" UNIQUE("bill_id"),
	CONSTRAINT "receipts_paymentId_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "overpayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_poisha" integer NOT NULL,
	"status" "overpayment_status" DEFAULT 'Flagged' NOT NULL,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone,
	"refunded_by_id" uuid,
	CONSTRAINT "overpayments_paymentId_unique" UNIQUE("payment_id"),
	CONSTRAINT "overpayments_amount_positive" CHECK ("overpayments"."amount_poisha" > 0),
	CONSTRAINT "overpayments_refunded_fields" CHECK (("overpayments"."status" = 'Refunded') = ("overpayments"."refunded_at" is not null and "overpayments"."refunded_by_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "overpayments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_started_by_id_profiles_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overpayments" ADD CONSTRAINT "overpayments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overpayments" ADD CONSTRAINT "overpayments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overpayments" ADD CONSTRAINT "overpayments_refunded_by_id_profiles_id_fk" FOREIGN KEY ("refunded_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_open_per_bill" ON "payments" USING btree ("bill_id") WHERE "payments"."confirmed_at" is null and "payments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "payments_bill_idx" ON "payments" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "overpayments_status_idx" ON "overpayments" USING btree ("status");