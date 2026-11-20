/**
 * A flat in a block. Bills, guest passes and tickets reach a flat through its occupancy; a bill made while the
 * flat is vacant belongs to the flat itself (BR-09).
 *
 * @author Mahir Al Kamal
 */
import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { blocks } from './Block';

/** Flats: number and floor, unique by number within a block. */
export const flats = pgTable(
  'flats',
  {
    id: uuid().primaryKey().defaultRandom(),
    blockId: uuid()
      .notNull()
      .references(() => blocks.id),
    number: text().notNull(),
    floor: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.blockId, table.number)],
).enableRLS();

/** A flat as read from the database. */
export type Flat = typeof flats.$inferSelect;

/** The fields needed to create a flat. */
export type NewFlat = typeof flats.$inferInsert;
