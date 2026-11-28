/**
 * Manager bill listing adapter.
 * BB-0508, BB-0509, BM-03.
 *
 * @author Jannatul Ferdus Nishi
 */

import { desc, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { bills, blocks, flats, occupancies } from '@/models';

/**
 * Creates the database-backed adapter for listing manager bills.
 *
 * @param db - Database connection.
 * @returns The manager bill listing adapter.
 */
export function databaseManagerBillStore(db: Database) {
  return {
    /**
     * Lists monthly bills with their flat and household details.
     *
     * @returns Monthly bills ordered by billing month and creation date, newest first.
     */
    async listBills() {
      return db
        .select({
          id: bills.id,
          flatId: bills.flatId,
          occupancyId: bills.occupancyId,
          billingMonth: bills.billingMonth,
          dueDate: bills.dueDate,
          totalPoisha: bills.totalPoisha,
          status: bills.status,
          createdAt: bills.createdAt,
          updatedAt: bills.updatedAt,
          flatNumber: flats.number,
          blockName: blocks.name,
          householdName: occupancies.householdName,
        })
        .from(bills)
        .leftJoin(flats, eq(bills.flatId, flats.id))
        .leftJoin(blocks, eq(flats.blockId, blocks.id))
        .leftJoin(occupancies, eq(bills.occupancyId, occupancies.id))
        .orderBy(desc(bills.billingMonth), desc(bills.createdAt));
    },
  };
}
