/**
 * Database adapter for listing manager bills.
 * BB-0508, BM-03, NFR-06.
 *
 * @author Jannatul Ferdus Nishi
 */

import { desc } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { bills } from '@/models';

/**
 * Creates a database-backed store for manager bill listing.
 *
 * @param db - Shared database connection.
 * @returns A store for viewing all monthly bills.
 */
export function databaseManagerBillStore(db: Database) {
  return {
    /**
     * Return all bills, with the newest billing months first.
     */
    async listBills() {
      return db.select().from(bills).orderBy(desc(bills.billingMonth), desc(bills.createdAt));
    },
  };
}
