/**
 * Database adapter for `emergencyContactService.ts`: reads the `emergency_contacts` table. Connection code only; the
 * rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import type { Database } from '@/lib/db';
import { emergencyContacts } from '@/models';
import type { EmergencyContactStore } from '@/services/emergencyContactService';

/**
 * An {@link EmergencyContactStore} backed by the `emergency_contacts` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseEmergencyContactStore(db: Database): EmergencyContactStore {
  return {
    async list() {
      return db.select().from(emergencyContacts);
    },
  };
}
