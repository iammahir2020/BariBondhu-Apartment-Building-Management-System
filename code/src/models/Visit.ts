/**
 * A recorded guest check-in against a guest pass (SG-03, SG-07).
 * Each row represents one entry event so its time and responsible guard are preserved.
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { guestPasses } from './GuestPass';
import { profiles } from './Profile';

/** Guest entry events. */
export const visits = pgTable(
  'visits',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The guest pass used for this entry. */
    guestPassId: uuid()
      .notNull()
      .references(() => guestPasses.id),
    /** Number of guests who entered in this event. */
    guestsIn: integer().notNull(),
    /** Actual time the guests entered, including paper-register entries. */
    enteredAt: timestamp({ withTimezone: true }).notNull(),
    /** Guard account that recorded this entry. */
    guardId: uuid()
      .notNull()
      .references(() => profiles.id),
    /** True when this entry was recorded later from the paper register. */
    enteredLater: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('visits_guests_in_positive', sql`${table.guestsIn} > 0`),
    index('visits_guest_pass_idx').on(table.guestPassId),
    index('visits_guard_idx').on(table.guardId),
    index('visits_entered_at_idx').on(table.enteredAt),
  ],
).enableRLS();

/** A visit entry as read from the database. */
export type Visit = typeof visits.$inferSelect;

/** The fields needed to record a visit entry. */
export type NewVisit = typeof visits.$inferInsert;
