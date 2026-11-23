/**
 * Individual charges, carried-forward balances and adjustments
 * belonging to a monthly bill (BM-03, BR-05, BR-07).
 *
 * @author Jannatul Ferdus Nishi
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bills } from './Bill';

/** Types of line items supported by the billing system. */
export const billLineItemTypeEnum = pgEnum('bill_line_item_type', [
  'service',
  'generator',
  'water',
  'carried_forward',
  'adjustment',
]);

/** Each row represents one component of a bill's total. */
export const billLineItems = pgTable(
  'bill_line_items',
  {
    id: uuid().primaryKey().defaultRandom(),

    billId: uuid()
      .notNull()
      .references(() => bills.id),

    type: billLineItemTypeEnum().notNull(),

    /** Amount in whole poisha; adjustments may be negative. */
    amountPoisha: integer().notNull(),

    /** Required for adjustment explanations. */
    description: text(),

    /** Original bill when this line carries an earlier unpaid balance. */
    sourceBillId: uuid().references(() => bills.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'bill_line_items_adjustment_reason',
      sql`${table.type} <> 'adjustment' OR
        (${table.description} IS NOT NULL AND length(trim(${table.description})) > 0)`,
    ),

    check(
      'bill_line_items_carried_source',
      sql`${table.type} <> 'carried_forward' OR ${table.sourceBillId} IS NOT NULL`,
    ),

    index('bill_line_items_bill_idx').on(table.billId),
    index('bill_line_items_source_bill_idx').on(table.sourceBillId),
  ],
).enableRLS();

/** A line item returned from the database. */
export type BillLineItem = typeof billLineItems.$inferSelect;

/** Fields used to create a bill line item. */
export type NewBillLineItem = typeof billLineItems.$inferInsert;
