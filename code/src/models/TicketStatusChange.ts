/**
 * One saved change of a ticket's status: who made it, when, and the reason where one is needed (On hold, reopen,
 * Duplicate, Won't fix). The manager reads this history on the ticket (BM-07), and residents are notified from it
 * (RES-02, MNT-03).
 *
 * @author Mahir Al Kamal
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';
import { ticketStatusEnum, tickets } from './Ticket';

/** Ticket status changes: the ticket's history, oldest first by `createdAt`. */
export const ticketStatusChanges = pgTable(
  'ticket_status_changes',
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id),
    /** Empty for the first row, when the ticket is created as Reported. */
    fromStatus: ticketStatusEnum(),
    toStatus: ticketStatusEnum().notNull(),
    changedById: uuid()
      .notNull()
      .references(() => profiles.id),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_status_changes_ticket_idx').on(table.ticketId)],
).enableRLS();

/** A ticket status change as read from the database. */
export type TicketStatusChange = typeof ticketStatusChanges.$inferSelect;

/** The fields needed to record a ticket status change. */
export type NewTicketStatusChange = typeof ticketStatusChanges.$inferInsert;
