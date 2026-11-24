/**
 * Monthly bills for flats (BM-03, BR-02, BR-05, BR-07, BR-09).
 * A vacant flat has no occupancy, but still receives a bill.
 *
 * @author Jannatul Ferdus Nishi
 */
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { flats } from './Flat';
import { occupancies } from './Occupancy';

/** Payment states supported by the billing workflow. */
export const billStatusEnum = pgEnum('bill_status', [
  'Unpaid',
  'Payment pending',
  'Awaiting verification',
  'Paid',
  'Carried forward',
]);

/** One monthly bill per flat. */
export const bills = pgTable(
  'bills',
  {
    id: uuid().primaryKey().defaultRandom(),

    flatId: uuid()
      .notNull()
      .references(() => flats.id),

    /** Null when a bill is generated for a vacant flat. */
    occupancyId: uuid().references(() => occupancies.id),

    /** First day of the billing month, stored as YYYY-MM-DD. */
    billingMonth: date({ mode: 'string' }).notNull(),

    dueDate: date({ mode: 'string' }).notNull(),

    /** Total amount in whole poisha. */
    totalPoisha: integer().notNull().default(0),

    status: billStatusEnum().notNull().default('Unpaid'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('bills_flat_month_unique').on(table.flatId, table.billingMonth),

    check('bills_due_date_valid', sql`${table.dueDate} >= ${table.billingMonth}`),

    check('bills_month_first_day', sql`EXTRACT(DAY FROM ${table.billingMonth}) = 1`),

    index('bills_status_idx').on(table.status),
    index('bills_occupancy_idx').on(table.occupancyId),
  ],
).enableRLS();

/** A bill returned from the database. */
export type Bill = typeof bills.$inferSelect;

/** Fields used to create a bill. */
export type NewBill = typeof bills.$inferInsert;
