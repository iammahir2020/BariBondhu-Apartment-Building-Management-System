/**
 * A block of a building (for example "A" or "B"). Announcements can target one block (BM-07).
 *
 * @author Mahir Al Kamal
 */
import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { buildings } from './Building';

/** Blocks: each belongs to one building, and its name is unique within that building. */
export const blocks = pgTable(
  'blocks',
  {
    id: uuid().primaryKey().defaultRandom(),
    buildingId: uuid()
      .notNull()
      .references(() => buildings.id),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.buildingId, table.name)],
).enableRLS();

/** A block as read from the database. */
export type Block = typeof blocks.$inferSelect;

/** The fields needed to create a block. */
export type NewBlock = typeof blocks.$inferInsert;
