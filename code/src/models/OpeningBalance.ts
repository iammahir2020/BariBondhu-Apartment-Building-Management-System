/**
 * The opening balance of the first month in the system: entered by the manager, approved or rejected by the
 * committee (BM-12, CM-02). The first fund summary can be published only after it is Approved. Approved is final;
 * a Rejected balance goes back to Waiting for approval when the manager enters a corrected figure.
 *
 * @author Ayesha Siddiqa
 */
import { date, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** Where an opening balance is in the approval flow. */
export const openingBalanceStatusEnum = pgEnum('opening_balance_status', [
  'Waiting for approval',
  'Approved',
  'Rejected',
]);

/** Opening balances: one row per month that needs one (in practice, the first month). */
export const openingBalances = pgTable('opening_balances', {
  id: uuid().primaryKey().defaultRandom(),
  /** First day of the month the balance is for, like 2026-10-01. */
  month: date({ mode: 'string' }).notNull().unique(),
  /** Balance at the start of the month in whole poisha, never a float. */
  amountPoisha: integer().notNull(),
  /** The manager's note about where the figure comes from. */
  note: text(),
  status: openingBalanceStatusEnum().notNull().default('Waiting for approval'),
  /** The manager who entered it. */
  enteredBy: uuid()
    .notNull()
    .references(() => profiles.id),
  /** The committee member who approved or rejected it. */
  decidedBy: uuid().references(() => profiles.id),
  decidedAt: timestamp({ withTimezone: true }),
  /** Required when the balance is Rejected. */
  decisionReason: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** An opening balance as read from the database. */
export type OpeningBalance = typeof openingBalances.$inferSelect;

/** The fields needed to create an opening balance. */
export type NewOpeningBalance = typeof openingBalances.$inferInsert;
