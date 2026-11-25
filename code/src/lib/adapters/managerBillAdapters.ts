/**
 * Manager bill listing adapter.
 * BB-0508, BB-0509, BM-03.
 *
 * @author Jannatul Ferdus Nishi
 */

import { desc, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { bills, flats, occupancies } from '@/models';

/**
 * Lists monthly bills with flat and household details.
 */
export function databaseManagerBillStore(db: Database) {
  return {
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
          householdName: occupancies.householdName,
        })
        .from(bills)
        .leftJoin(flats, eq(bills.flatId, flats.id))
        .leftJoin(occupancies, eq(bills.occupancyId, occupancies.id))
        .orderBy(desc(bills.billingMonth), desc(bills.createdAt));
    },
  };
}
