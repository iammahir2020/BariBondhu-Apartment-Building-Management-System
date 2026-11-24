/**
 * Online payments (RES-01): one row each time a resident taps Pay on a bill and is sent to the gateway. The row keeps
 * the gateway's transaction id, the amount asked for and how the attempt ended: confirmed by the gateway, or ended
 * because it failed, was cancelled or timed out with no success (BR-04).
 *
 * A bill has at most one unfinished payment at a time (BR-03), which the partial unique index enforces. A timed-out
 * payment can still be confirmed later (TC-R01-07); confirming it clears its end time and reason.
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bills } from './Bill';
import { profiles } from './Profile';

/** Online payment attempts. */
export const payments = pgTable(
  'payments',
  {
    /** Also the reference the gateway sends back with its confirmation. */
    id: uuid().primaryKey(),
    billId: uuid()
      .notNull()
      .references(() => bills.id),
    /** The gateway's transaction id; it goes on the receipt (RES-01 c3). */
    gatewayTransactionId: text().notNull().unique(),
    /** The bill total when the payment started, in poisha; partial payments aren't supported (BR-06). */
    amountPoisha: integer().notNull(),
    /** The household account that tapped Pay. */
    startedById: uuid()
      .notNull()
      .references(() => profiles.id),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When the gateway confirmed the money arrived (BR-02). */
    confirmedAt: timestamp({ withTimezone: true }),
    /** When the attempt ended without money: failed, cancelled or timed out (BR-04). */
    endedAt: timestamp({ withTimezone: true }),
    /** Why it ended, shown on Dues (RES-01 c5). */
    endReason: text(),
  },
  (table) => [
    check('payments_amount_positive', sql`${table.amountPoisha} > 0`),
    check(
      'payments_confirmed_or_ended',
      sql`${table.confirmedAt} is null or ${table.endedAt} is null`,
    ),
    check('payments_end_reason', sql`(${table.endedAt} is null) = (${table.endReason} is null)`),
    uniqueIndex('payments_one_open_per_bill')
      .on(table.billId)
      .where(sql`${table.confirmedAt} is null and ${table.endedAt} is null`),
    index('payments_bill_idx').on(table.billId),
  ],
).enableRLS();

/** A payment as read from the database. */
export type Payment = typeof payments.$inferSelect;

/** The fields needed to save a new payment. */
export type NewPayment = typeof payments.$inferInsert;
