/**
 * Writes audit log entries (NFR-27). Every service that changes accounts, occupancies, bills, payments, claims,
 * rates, expenses, tickets, passes or gate records calls it with the acting account and the old and new values.
 * Never put passwords or reset links in the values.
 *
 * @author Mahir Al Kamal
 */
import type { Database } from '@/lib/db';
import { auditLogs, type NewAuditLog } from '@/models';

/** Adds one audit log entry. Services take this as a dependency, so tests can collect entries instead. */
export type AuditWriter = (entry: NewAuditLog) => Promise<void>;

/**
 * An {@link AuditWriter} that saves to the `audit_logs` table.
 * @param db - Database to write to.
 * @returns The writer.
 */
export function databaseAuditWriter(db: Database): AuditWriter {
  return async (entry) => {
    await db.insert(auditLogs).values(entry);
  };
}
