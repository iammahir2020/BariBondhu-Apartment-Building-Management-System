/**
 * A common-area place a fault can be reported against: Lift 1, the water pump, the roof and so on. Residents pick
 * from this fixed list, and the manager can add to it (BR-13). A place is switched off rather than deleted, so old
 * tickets keep their place.
 *
 * @author Mahir Al Kamal
 */
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Common-area places: unique by name; only active ones are offered when reporting a fault. */
export const commonAreaPlaces = pgTable('common_area_places', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** A common-area place as read from the database. */
export type CommonAreaPlace = typeof commonAreaPlaces.$inferSelect;

/** The fields needed to create a common-area place. */
export type NewCommonAreaPlace = typeof commonAreaPlaces.$inferInsert;
