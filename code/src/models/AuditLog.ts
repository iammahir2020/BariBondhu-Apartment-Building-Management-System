/**
 * The audit log (NFR-27): who changed what, when, and the old and new values. Rows can only be added; a trigger in
 * the migrations refuses updates and deletes.
 *
 * @author Mahir Al Kamal
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** Audit log entries, oldest first by `id`. */
export const auditLogs = pgTable('audit_logs', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  /** The acting account; empty for changes the system makes itself (a timeout, a scheduled bill run). */
  actorId: uuid().references(() => profiles.id),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** What happened, as a short verb phrase: `occupancy.end`, `rate.change`. */
  action: text().notNull(),
  /** The table the change was made to, like `occupancies`. */
  entityType: text().notNull(),
  entityId: text().notNull(),
  oldValues: jsonb(),
  newValues: jsonb(),
}).enableRLS();

/** An audit log entry as read from the database. */
export type AuditLog = typeof auditLogs.$inferSelect;

/** The fields needed to add an audit log entry. */
export type NewAuditLog = typeof auditLogs.$inferInsert;
