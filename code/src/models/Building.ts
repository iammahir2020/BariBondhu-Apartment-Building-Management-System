/**
 * The building the app runs. One installation runs one building; the table still allows more, so the
 * administrator's setup screen (ADM-03) can create it like any other record.
 *
 * @author Mahir Al Kamal
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Buildings: name and address, entered by the administrator at setup. */
export const buildings = pgTable('buildings', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  address: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** A building as read from the database. */
export type Building = typeof buildings.$inferSelect;

/** The fields needed to create a building. */
export type NewBuilding = typeof buildings.$inferInsert;
