/**
 * Demo monthly bill seed data (BB-0504, BM-03).
 * Creates one bill per flat, including vacant flats.
 * Safe to rerun without duplicating monthly bills.
 *
 * @author Jannatul Ferdus Nishi
 */
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/models';

const { bills, billLineItems, chargeRates } = schema;

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

/** Fixed demo month and due date. */
const BILLING_MONTH = '2026-11-01';
const DUE_DATE = '2026-12-10';

const CHARGE_TYPES = ['service', 'generator', 'water'] as const;

/**
 * Creates demonstration bills using the committee's current rates.
 * Existing bills for the same flat and month are left unchanged.
 */
export async function seedBills(
  db: SeedDatabase,
  flatIds: Map<string, string>,
  occupancyIds: Map<string, string>,
): Promise<number> {
  const currentRates = await db.select().from(chargeRates).where(eq(chargeRates.status, 'Current'));

  const rates = CHARGE_TYPES.map((type) => {
    const matches = currentRates.filter((rate) => rate.chargeType === type);

    if (matches.length !== 1) {
      throw new Error(`Expected exactly one current ${type} charge rate.`);
    }

    const rate = matches[0];
    if (!rate) {
      throw new Error(`Current ${type} charge rate is missing.`);
    }

    if (rate.amountPoisha < 0) {
      throw new Error(`${type} charge cannot be negative.`);
    }

    return rate;
  });

  const totalPoisha = rates.reduce((total, rate) => total + rate.amountPoisha, 0);

  let created = 0;

  for (const [key, flatId] of flatIds) {
    const [existing] = await db
      .select({ id: bills.id })
      .from(bills)
      .where(and(eq(bills.flatId, flatId), eq(bills.billingMonth, BILLING_MONTH)))
      .limit(1);

    if (existing) {
      console.log(`Bill already exists: ${key}`);
      continue;
    }

    const inserted = await db.transaction(async (tx) => {
      const [bill] = await tx
        .insert(bills)
        .values({
          flatId,
          occupancyId: occupancyIds.get(key) ?? null,
          billingMonth: BILLING_MONTH,
          dueDate: DUE_DATE,
          totalPoisha,
          status: totalPoisha === 0 ? 'Paid' : 'Unpaid',
        })
        .onConflictDoNothing()
        .returning({ id: bills.id });

      if (!bill) return false;

      await tx.insert(billLineItems).values(
        rates.map((rate) => ({
          billId: bill.id,
          type: rate.chargeType,
          amountPoisha: rate.amountPoisha,
          description: `${rate.chargeType} monthly charge`,
        })),
      );

      return true;
    });

    if (inserted) {
      created += 1;
      console.log(`Created demo bill: ${key}`);
    }
  }

  return created;
}
