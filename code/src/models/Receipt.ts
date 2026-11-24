/**
 * Receipts for paid bills (RES-01 c3, UC-R08): made when the gateway confirms a payment and the bill becomes Paid.
 * A bill has one receipt. The receipt number comes from a database counter, so two receipts can never share one; it is
 * shown as `R-000123` (see `formatReceiptNumber` in `myBillsService.ts`).
 *
 * The rest of what the receipt shows (flat, month, each charge, total) is read from the bill and its lines, which
 * can't change once the bill is Paid (BR-07).
 *
 * @author Mahir Al Kamal
 */
import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bills } from './Bill';
import { payments } from './Payment';

/** Receipts. */
export const receipts = pgTable('receipts', {
  id: uuid().primaryKey().defaultRandom(),
  /** The receipt number, counted up by the database. */
  number: integer().notNull().unique().generatedAlwaysAsIdentity(),
  billId: uuid()
    .notNull()
    .unique()
    .references(() => bills.id),
  /** The payment that paid the bill; its gateway transaction id is printed on the receipt. */
  paymentId: uuid()
    .notNull()
    .unique()
    .references(() => payments.id),
  amountPoisha: integer().notNull(),
  /** When the gateway confirmed the payment. */
  paidAt: timestamp({ withTimezone: true }).notNull(),
}).enableRLS();

/** A receipt as read from the database. */
export type Receipt = typeof receipts.$inferSelect;

/** The fields needed to save a receipt; the number is filled in by the database. */
export type NewReceipt = typeof receipts.$inferInsert;
