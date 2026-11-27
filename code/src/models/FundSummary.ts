/**
 * The monthly fund summary (BM-12, RES-05): the opening balance, what was collected, what was spent by category,
 * the closing balance and the total outstanding for one month. The figures are worked out by the service from the
 * saved bills and Approved expenses (BR-10) and saved here when the manager publishes.
 *
 * @author Ayesha Siddiqa
 */
import { date, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** Where a fund summary is: Revised is for a late approval that changes a published month. */
export const fundSummaryStatusEnum = pgEnum('fund_summary_status', [
  'Draft',
  'Published',
  'Revised',
]);

/** Fund summaries: one row per month. All amounts are whole poisha. */
export const fundSummaries = pgTable('fund_summaries', {
  id: uuid().primaryKey().defaultRandom(),
  /** First day of the month the summary is for, like 2026-10-01. */
  month: date({ mode: 'string' }).notNull().unique(),
  openingBalancePoisha: integer().notNull(),
  /** Payments confirmed in the month (BR-10). */
  totalCollectedPoisha: integer().notNull(),
  spentRepairPoisha: integer().notNull(),
  spentSalaryPoisha: integer().notNull(),
  spentUtilityPoisha: integer().notNull(),
  spentOtherPoisha: integer().notNull(),
  /** Opening balance + collected - spent. */
  closingBalancePoisha: integer().notNull(),
  /** Sum of the saved bills still unpaid. */
  totalOutstandingPoisha: integer().notNull(),
  status: fundSummaryStatusEnum().notNull().default('Draft'),
  /** The manager who published it. */
  publishedBy: uuid().references(() => profiles.id),
  publishedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** A fund summary as read from the database. */
export type FundSummary = typeof fundSummaries.$inferSelect;

/** The fields needed to create a fund summary. */
export type NewFundSummary = typeof fundSummaries.$inferInsert;
