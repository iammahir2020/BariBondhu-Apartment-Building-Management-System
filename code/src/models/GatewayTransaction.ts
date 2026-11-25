/**
 * The simulated payment gateway's own records (RES-01, SRS v1.6): one row per payment a resident starts, as a real
 * gateway sandbox would keep on its side. The app's Payment and Receipt tables (BB-0603) are separate; they only
 * hold the transaction id this table hands out. No real money moves.
 *
 * The states are the gateway's, not the bill's: a transaction is Pending until the test checkout page pays, fails
 * or cancels it, and never changes after that.
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** What the gateway says about a payment, as a sandbox would report it. */
export const GATEWAY_PAYMENT_STATES = ['Pending', 'Succeeded', 'Failed', 'Cancelled'] as const;

/** A gateway payment's state. */
export type GatewayPaymentState = (typeof GATEWAY_PAYMENT_STATES)[number];

/** The gateway states as a database enum. */
export const gatewayPaymentStateEnum = pgEnum('gateway_payment_state', GATEWAY_PAYMENT_STATES);

/** The simulated gateway's transactions. */
export const gatewayTransactions = pgTable(
  'gateway_transactions',
  {
    /** The gateway's transaction id, like `SIM-1A2B3C4D5E6F`; it goes on the receipt (RES-01 c3). */
    id: text().primaryKey(),
    /** What the app asked to be paid: its own reference, so the confirmation can be matched back. */
    reference: text().notNull(),
    /** The amount asked for, in poisha. */
    amountPoisha: integer().notNull(),
    state: gatewayPaymentStateEnum().notNull().default('Pending'),
    /** Why a payment failed or was cancelled, as the gateway words it. */
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When the checkout paid, failed or cancelled it. */
    decidedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    check('gateway_transactions_amount_positive', sql`${table.amountPoisha} > 0`),
    check(
      'gateway_transactions_decided_when_not_pending',
      sql`(${table.state} = 'Pending') = (${table.decidedAt} is null)`,
    ),
  ],
).enableRLS();

/** A gateway transaction as read from the database. */
export type GatewayTransaction = typeof gatewayTransactions.$inferSelect;
