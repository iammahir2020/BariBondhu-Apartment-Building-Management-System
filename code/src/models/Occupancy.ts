/**
 * An occupancy: one household living in one flat for a period. The household's records belong to it, so the
 * next household starts with an empty history (BR-09, NFR-13). A flat has at most one active occupancy, the one
 * with no end date (BM-02).
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { flats } from './Flat';

/** Whether the household owns the flat or rents it (BM-02). Both are billed the same way. */
export const occupancyTypeEnum = pgEnum('occupancy_type', ['owner', 'tenant']);

/** Owner or tenant. */
export type OccupancyType = (typeof occupancyTypeEnum.enumValues)[number];

/** Occupancies: active while `endDate` is empty. */
export const occupancies = pgTable(
  'occupancies',
  {
    id: uuid().primaryKey().defaultRandom(),
    flatId: uuid()
      .notNull()
      .references(() => flats.id),
    householdName: text().notNull(),
    type: occupancyTypeEnum().notNull(),
    startDate: date().notNull(),
    endDate: date(),
    /** How Unpaid bills will be settled, entered when the occupancy ends with bills still Unpaid (BM-02). */
    endNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('occupancies_one_active_per_flat')
      .on(table.flatId)
      .where(sql`${table.endDate} is null`),
    check(
      'occupancies_end_after_start',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
  ],
).enableRLS();

/** An occupancy as read from the database. */
export type Occupancy = typeof occupancies.$inferSelect;

/** The fields needed to create an occupancy. */
export type NewOccupancy = typeof occupancies.$inferInsert;
