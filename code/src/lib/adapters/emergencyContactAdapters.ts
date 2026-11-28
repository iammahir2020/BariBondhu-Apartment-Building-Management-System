/**
 * Database adapter for emergencyContactService.ts.
 * Reads and updates the emergency_contacts table.
 *
 * @author Adika Rahman
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { emergencyContacts } from '@/models';
import type { EmergencyContactStore } from '@/services/emergencyContactService';

/**
 * An EmergencyContactStore backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseEmergencyContactStore(db: Database): EmergencyContactStore {
  return {
    async list() {
      return db.select().from(emergencyContacts);
    },

    async updateByLabel(label, phone) {
      const [updated] = await db
        .update(emergencyContacts)
        .set({ phone })
        .where(eq(emergencyContacts.label, label))
        .returning();

      return updated;
    },
  };
}
