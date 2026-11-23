/**
 * Building expenses: recorded by the manager, approved or rejected by the committee (BM-08, CM-02). Only Approved
 * expenses count in the fund summary (BR-10). An Approved expense is never edited; a correcting expense that links
 * to it is added instead.
 *
 * @author Ayesha Siddiqa
 */
import {
  type AnyPgColumn,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** What an expense was spent on. */
export const expenseCategoryEnum = pgEnum('expense_category', [
  'repair',
  'salary',
  'utility',
  'other',
]);

/** Where an expense is in the approval flow. */
export const expenseStatusEnum = pgEnum('expense_status', [
  'Waiting for approval',
  'Approved',
  'Rejected',
]);

/** Expenses: one row per expense, including correcting expenses. */
export const expenses = pgTable('expenses', {
  id: uuid().primaryKey().defaultRandom(),
  /** Amount in whole poisha, never a float. Negative for a correcting expense. */
  amountPoisha: integer().notNull(),
  expenseDate: date({ mode: 'string' }).notNull(),
  category: expenseCategoryEnum().notNull(),
  description: text().notNull(),
  /** Optional receipt photo, stored as a path or URL. */
  receiptPhoto: text(),
  status: expenseStatusEnum().notNull().default('Waiting for approval'),
  /** Set when this expense corrects an earlier Approved one. */
  correctsExpenseId: uuid().references((): AnyPgColumn => expenses.id),
  /** Note saved when the manager edits an expense that is still waiting. */
  editNote: text(),
  /** The manager who recorded it. */
  recordedBy: uuid()
    .notNull()
    .references(() => profiles.id),
  /** The committee member who approved or rejected it. */
  decidedBy: uuid().references(() => profiles.id),
  decidedAt: timestamp({ withTimezone: true }),
  /** Required when the expense is Rejected. */
  decisionReason: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** An expense as read from the database. */
export type Expense = typeof expenses.$inferSelect;

/** The fields needed to create an expense. */
export type NewExpense = typeof expenses.$inferInsert;
