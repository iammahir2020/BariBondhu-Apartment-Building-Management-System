/**
 * Database adapter for monthly bill generation.
 *
 * BB-0505, BB-0508, BM-03.
 * Supports shared database transactions.
 *
 * @author Jannatul Ferdus Nishi
 */

import { eq, isNull } from 'drizzle-orm';
import type { Database } from '@/lib/db';

import { bills, billLineItems, chargeRates, flats, occupancies } from '@/models';

import type { MonthlyBillStore } from '@/services/generateMonthlyBills';

type BillTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Creates a monthly bill store.
 * Reuses an existing transaction when provided.
 */
export function databaseMonthlyBillStore(
  db: Database,
  existingTx?: BillTransaction,
): MonthlyBillStore {
  return {
    async listFlats() {
      if (existingTx) {
        return existingTx.select().from(flats);
      }

      return db.select().from(flats);
    },

    async listActiveOccupancies() {
      if (existingTx) {
        return existingTx.select().from(occupancies).where(isNull(occupancies.endDate));
      }

      return db.select().from(occupancies).where(isNull(occupancies.endDate));
    },

    async listCurrentRates() {
      if (existingTx) {
        return existingTx.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));
      }

      return db.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));
    },

    async monthHasBills(billingMonth) {
      const existing = existingTx
        ? await existingTx
            .select({ id: bills.id })
            .from(bills)
            .where(eq(bills.billingMonth, billingMonth))
            .limit(1)
        : await db
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

      const createBills = async (tx: BillTransaction) => {
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
      };

      // BB-0508: Reuse the shared transaction.
      if (existingTx) {
        return createBills(existingTx);
      }

      // BB-0505: Preserve standalone behaviour.
      return db.transaction(createBills);
    },
  };
}
