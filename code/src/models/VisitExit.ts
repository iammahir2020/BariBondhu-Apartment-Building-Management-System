/**
 * A recorded guest exit event (SG-04).
 * Separate rows preserve the time and responsible guard for each partial exit.
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';
import { visits } from './Visit';

/** Guest exit events. */
export const visitExits = pgTable(
  'visit_exits',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The entry event these guests are leaving from. */
    visitId: uuid()
      .notNull()
      .references(() => visits.id),
    /** Number of guests leaving in this event. */
    guestsOut: integer().notNull(),
    exitedAt: timestamp({ withTimezone: true }).notNull(),
    /** Guard account that recorded this exit. */
    guardId: uuid()
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('visit_exits_guests_out_positive', sql`${table.guestsOut} > 0`),
    index('visit_exits_visit_idx').on(table.visitId),
    index('visit_exits_guard_idx').on(table.guardId),
    index('visit_exits_exited_at_idx').on(table.exitedAt),
  ],
).enableRLS();

/** A visit exit as read from the database. */
export type VisitExit = typeof visitExits.$inferSelect;

/** The fields needed to record a visit exit. */
export type NewVisitExit = typeof visitExits.$inferInsert;
