/**
 * A maintenance worker's note on work performed for a ticket.
 *
 * @author Adika Rahman
 */
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';
import { tickets } from './Ticket';

/** Work notes recorded by maintenance staff against tickets. */
export const workNotes = pgTable(
  'work_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id),
    authorId: uuid()
      .notNull()
      .references(() => profiles.id),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('work_notes_text_length', sql`length(${table.text}) between 1 and 1000`),
    index('work_notes_ticket_idx').on(table.ticketId),
  ],
).enableRLS();

/** A work note as read from the database. */
export type WorkNote = typeof workNotes.$inferSelect;

/** The fields needed to create a work note. */
export type NewWorkNote = typeof workNotes.$inferInsert;
