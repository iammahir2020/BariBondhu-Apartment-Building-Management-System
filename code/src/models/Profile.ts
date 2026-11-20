/**
 * A user's profile: the app's side of a Supabase Auth user. Supabase keeps the password hash (NFR-04); this table
 * keeps the generated username, role, contact details and first-login state. A household shares one resident
 * profile, linked to its occupancy (BR-09).
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { boolean, check, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
// Relative path: drizzle-kit loads this file without the `@/` alias.
import { ROLES } from '../lib/roles';
import { occupancies } from './Occupancy';

/** The six roles as a database enum, built from {@link ROLES} so the two can't drift apart. */
export const roleEnum = pgEnum('role', ROLES);

/** Profiles: one per Supabase user, with the same id. */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** Generated and never the flat number (NFR-05). Supabase knows the user as `<username>@users.baribondhu.invalid`. */
    username: text().notNull().unique(),
    role: roleEnum().notNull(),
    displayName: text().notNull(),
    phone: text(),
    /** A real email for password reset links; without one the user asks the manager (BR-15). */
    email: text(),
    /** The household's occupancy; required for residents, empty for every other role. */
    occupancyId: uuid().references(() => occupancies.id),
    mustChangePassword: boolean().notNull().default(true),
    /** When an unused temporary password stops working: 7 days after it is issued (NFR-04). */
    tempPasswordExpiresAt: timestamp({ withTimezone: true }),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'profiles_occupancy_only_for_residents',
      sql`(${table.role} = 'resident') = (${table.occupancyId} is not null)`,
    ),
  ],
).enableRLS();

/** A profile as read from the database. */
export type Profile = typeof profiles.$inferSelect;

/** The fields needed to create a profile. */
export type NewProfile = typeof profiles.$inferInsert;
