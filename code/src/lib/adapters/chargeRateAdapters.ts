/**
 * Database adapter for `chargeRateService.ts`: reads and writes the `charge_rates` table. Connection code only; the
 * rules are in the service.
 *
 * @author Ayesha Siddiqa
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { chargeRates } from '@/models';
import type { ChargeRateStore } from '@/services/chargeRateService';

/**
 * A {@link ChargeRateStore} backed by the `charge_rates` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseChargeRateStore(db: Database): ChargeRateStore {
  return {
    async listCurrent() {
      return db.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));
    },
    async listAll() {
      return db.select().from(chargeRates);
    },
    async replaceCurrent(rate) {
      return db.transaction(async (tx) => {
        const replaced = await tx
          .update(chargeRates)
          .set({ status: 'Replaced' })
          .where(
            and(eq(chargeRates.chargeType, rate.chargeType), eq(chargeRates.status, 'Current')),
          )
          .returning();
        const [created] = await tx.insert(chargeRates).values(rate).returning();
        if (!created) throw new Error('Charge rate insert returned no row.');
        return { previous: replaced[0] ?? null, created };
      });
    },
  };
}
