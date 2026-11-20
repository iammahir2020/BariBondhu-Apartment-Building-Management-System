/**
 * Wrong-password counts for BR-14. Counted per browser (a random device id kept in a cookie) so nobody can lock
 * another person out, and on the shared gate device per username, so one guard's mistakes never block another.
 *
 * @author Mahir Al Kamal
 */
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Login attempts: one row per counting key. */
export const loginAttempts = pgTable('login_attempts', {
  /** `device:<device id>` for an ordinary browser, `gate:<username>` on the gate device. */
  key: text().primaryKey(),
  /** Wrong passwords in a row; reset by a successful log-in. */
  failedCount: integer().notNull().default(0),
  /** Set after the 5th wrong password in a row: no log-in from this key until then. */
  lockedUntil: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** A login attempt row as read from the database. */
export type LoginAttempt = typeof loginAttempts.$inferSelect;

/** The fields needed to create a login attempt row. */
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
