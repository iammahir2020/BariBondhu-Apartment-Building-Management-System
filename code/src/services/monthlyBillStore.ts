/**
 * Drizzle database store for monthly bill generation.
 *
 * BB-0505: Generate Monthly Bills.
 *
 * Inserts bills and their charge line items in one
 * transaction. Existing bills are never overwritten.
 *
 * @author Jannatul Ferdus Nishi
 */

import { eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';

import { bills, billLineItems, chargeRates, flats, occupancies } from '@/models';

import type { MonthlyBillDraft, MonthlyBillStore } from '@/services/generateMonthlyBills';

/**
 * PostgreSQL implementation of MonthlyBillStore.
 */
export const monthlyBillStore: MonthlyBillStore = {
  /**
   * Include every flat, whether occupied or vacant.
   */
  async listFlats() {
    return db.select().from(flats);
  },

  /**
   * An active occupancy has no end date.
   */
  async listActiveOccupancies() {
    return db.select().from(occupancies).where(isNull(occupancies.endDate));
  },

  /**
   * Only currently approved charge rates are used.
   */
  async listCurrentRates() {
    return db.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));
  },

  /**
   * Create missing monthly bills atomically.
   *
   * PostgreSQL's unique constraint prevents two
   * concurrent requests from creating the same bill.
   *
   * Returning no row after ON CONFLICT means the bill
   * already exists, so its line items are not changed.
   */
  async createMissing(drafts: MonthlyBillDraft[]) {
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
          // Already generated for this flat and month.
          continue;
        }

        if (draft.lineItems.length > 0) {
          await tx.insert(billLineItems).values(
            draft.lineItems.map((lineItem) => ({
              ...lineItem,
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
