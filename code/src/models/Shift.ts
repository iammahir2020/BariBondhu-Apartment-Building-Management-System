/**
 * A guard's assigned shift, with its scheduled start and end date-times and current state (BM-09, SG-05).
 * Shift planning and state transitions are handled by the shift service.
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** The four shift states from the shift state diagram in the SDS. */
export const shiftStatusEnum = pgEnum('shift_status', [
  'Planned',
  'On duty',
  'Finished',
  'Removed',
]);

/** One of the four shift states. */
export type ShiftStatus = (typeof shiftStatusEnum.enumValues)[number];

/** Guard shifts: each shift belongs to one guard profile. */
export const shifts = pgTable(
  'shifts',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The guard assigned to this shift. */
    guardId: uuid()
      .notNull()
      .references(() => profiles.id),
    /** Scheduled start date-time. */
    startsAt: timestamp({ withTimezone: true }).notNull(),
    /** Scheduled end date-time. */
    endsAt: timestamp({ withTimezone: true }).notNull(),
    status: shiftStatusEnum().notNull().default('Planned'),
  },
  (table) => [index('shifts_guard_idx').on(table.guardId)],
).enableRLS();

/** A shift as read from the database. */
export type Shift = typeof shifts.$inferSelect;

/** The fields needed to create a shift. */
export type NewShift = typeof shifts.$inferInsert;
