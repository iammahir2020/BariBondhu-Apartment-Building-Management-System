/**
 * A guest pass: a resident's pre-approval for named guests to enter during one visit window, shown to the guard as a
 * 6-digit code or QR code (RES-03, SG-02, BR-11). Guard visits (feature 17) link to it.
 *
 * There is no status column. The six states (Scheduled, Active, Partly used, Fully used, Cancelled, Expired) follow
 * from the times, the guests used and the cancellation time, and `guestPassStatusAt` in
 * `src/services/guestPassStatus.ts` works them out, so the status can't go stale when the end time passes. A row has
 * every field that function needs.
 *
 * Codes are unique only among passes that are Scheduled, Active or Partly used (BR-11). That depends on the time, so
 * the guest pass service checks it when it draws a code; the database only checks the format.
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { occupancies } from './Occupancy';
import { profiles } from './Profile';

/** Guest passes: each belongs to one household (occupancy), so the next household never sees it (BR-09). */
export const guestPasses = pgTable(
  'guest_passes',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The household the guests are visiting. */
    occupancyId: uuid()
      .notNull()
      .references(() => occupancies.id),
    /** The resident account that created the pass. */
    createdById: uuid()
      .notNull()
      .references(() => profiles.id),
    guestName: text().notNull(),
    /** How many people the pass lets in, 1 to 20. */
    guestCount: integer().notNull(),
    /** Start of the visit window. The window is at most 24 hours and may cross midnight (BR-11). */
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** Six digits, leading zeros kept ("004271"). */
    code: text().notNull(),
    /** How many guests the guards have checked in so far. */
    guestsUsed: integer().notNull().default(0),
    /** When the resident cancelled it, or when the household's occupancy ended (BR-11). */
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('guest_passes_guest_name_not_blank', sql`length(trim(${table.guestName})) > 0`),
    check('guest_passes_guest_count_1_to_20', sql`${table.guestCount} between 1 and 20`),
    check(
      'guest_passes_window_up_to_24_hours',
      sql`${table.endsAt} > ${table.startsAt} and ${table.endsAt} <= ${table.startsAt} + interval '24 hours'`,
    ),
    check('guest_passes_code_6_digits', sql`${table.code} ~ '^[0-9]{6}$'`),
    check(
      'guest_passes_guests_used_in_range',
      sql`${table.guestsUsed} between 0 and ${table.guestCount}`,
    ),
    index('guest_passes_code_idx').on(table.code),
    index('guest_passes_occupancy_idx').on(table.occupancyId),
  ],
).enableRLS();

/** A guest pass as read from the database. */
export type GuestPass = typeof guestPasses.$inferSelect;

/** The fields needed to create a guest pass. */
export type NewGuestPass = typeof guestPasses.$inferInsert;
