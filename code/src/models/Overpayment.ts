/**
 * Overpayments (BR-04, BM-04): a gateway payment that arrived for a bill that was by then Paid, Awaiting
 * verification or Carried forward. The money is recorded and the bill doesn't change. The manager sees it flagged
 * and marks it Refunded once the money has been returned outside the app.
 *
 * States, from the Overpayment state diagram: Flagged → Refunded.
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bills } from './Bill';
import { payments } from './Payment';
import { profiles } from './Profile';

/** The two overpayment states, named as in the state diagram. */
export const overpaymentStatusEnum = pgEnum('overpayment_status', ['Flagged', 'Refunded']);

/** An overpayment's state. */
export type OverpaymentStatus = (typeof overpaymentStatusEnum.enumValues)[number];

/** Overpayments waiting for, or given, a refund. */
export const overpayments = pgTable(
  'overpayments',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The bill the money was meant for; it stays as it was. */
    billId: uuid()
      .notNull()
      .references(() => bills.id),
    /** The confirmed payment that brought the money; one overpayment per payment. */
    paymentId: uuid()
      .notNull()
      .unique()
      .references(() => payments.id),
    amountPoisha: integer().notNull(),
    status: overpaymentStatusEnum().notNull().default('Flagged'),
    flaggedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When the manager marked it Refunded, and who did. */
    refundedAt: timestamp({ withTimezone: true }),
    refundedById: uuid().references(() => profiles.id),
  },
  (table) => [
    check('overpayments_amount_positive', sql`${table.amountPoisha} > 0`),
    check(
      'overpayments_refunded_fields',
      sql`(${table.status} = 'Refunded') = (${table.refundedAt} is not null and ${table.refundedById} is not null)`,
    ),
    index('overpayments_status_idx').on(table.status),
  ],
).enableRLS();

/** An overpayment as read from the database. */
export type Overpayment = typeof overpayments.$inferSelect;
