/**
 * A household following a ticket. The reporter's household follows its own ticket, and every household that taps
 * "Me too" on a common-area ticket follows it too (RES-02, BR-13). Followers are notified of status changes, and a
 * resident can cancel a Reported ticket only when no other household follows it.
 *
 * @author Mahir Al Kamal
 */
import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { occupancies } from './Occupancy';
import { tickets } from './Ticket';

/** Ticket followers: one row per household and ticket. */
export const ticketFollowers = pgTable(
  'ticket_followers',
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id),
    occupancyId: uuid()
      .notNull()
      .references(() => occupancies.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.ticketId, table.occupancyId)],
).enableRLS();

/** A ticket follower as read from the database. */
export type TicketFollower = typeof ticketFollowers.$inferSelect;

/** The fields needed to add a ticket follower. */
export type NewTicketFollower = typeof ticketFollowers.$inferInsert;
