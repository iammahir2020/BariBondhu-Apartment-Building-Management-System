/**
 * Database adapter for monthly bill generation (BB-0505).
 * Database operations are separated from business rules.
 *
 * @author Jannatul Ferdus Nishi
 */

import { eq, isNull } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { bills, billLineItems, chargeRates, flats, occupancies } from '@/models';
import type { MonthlyBillStore } from '@/services/generateMonthlyBills';

/**
 * Creates a database-backed monthly bill store.
 *
 * @param db - Shared Drizzle database client.
 * @returns Monthly bill database operations.
 */
export function databaseMonthlyBillStore(db: Database): MonthlyBillStore {
  return {
    async listFlats() {
      return db.select().from(flats);
    },

    async listActiveOccupancies() {
      return db.select().from(occupancies).where(isNull(occupancies.endDate));
    },

    async listCurrentRates() {
      return db.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));
    },

    async monthHasBills(billingMonth) {
      const existing = await db
        .select({ id: bills.id })
        .from(bills)
        .where(eq(bills.billingMonth, billingMonth))
        .limit(1);

      return existing.length > 0;
    },

    async createMissing(drafts) {
      if (drafts.length === 0) {
        return [];
      }

      return db.transaction(async (tx) => {
        const createdBills = [];

        for (const draft of drafts) {
          const inserted = await tx
            .insert(bills)
            .values(draft.bill)
            .onConflictDoNothing({
              target: [bills.flatId, bills.billingMonth],
            })
            .returning();

          const created = inserted[0];

          if (!created) {
            continue;
          }

          if (draft.lineItems.length > 0) {
            await tx.insert(billLineItems).values(
              draft.lineItems.map((item) => ({
                ...item,
                billId: created.id,
              })),
            );
          }

          createdBills.push(created);
        }

        return createdBills;
      });
    },
  };
}
