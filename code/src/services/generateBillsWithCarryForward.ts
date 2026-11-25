/**
 * Atomic monthly bill generation and carry forward.
 *
 * BB-0508, BM-03, BR-05, NFR-26, NFR-27.
 *
 * New bills, carried-forward balances and audit entries
 * must succeed or fail together in one transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import { inArray, sql } from 'drizzle-orm';

import { databaseMonthlyBillStore } from '@/lib/adapters/billAdapters';
import { databaseCarryForwardStore } from '@/lib/adapters/carryForwardAdapters';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills } from '@/models';

import { carryForwardUnpaidBills } from '@/services/carryForwardBills';
import {
  generateMonthlyBills,
  type GenerateMonthlyBillsInput,
  type GenerateMonthlyBillsResult,
} from '@/services/generateMonthlyBills';
import { applyExcessBillCredits } from '@/services/applyExcessBillCredits';
/**
 * Generate monthly bills and carry forward earlier unpaid
 * balances inside one database transaction.
 *
 * If any operation fails, PostgreSQL rolls back the entire
 * transaction, including bill creation and audit entries.
 */
export async function generateBillsWithCarryForward(
  db: Database,
  input: GenerateMonthlyBillsInput,
  managerId: string,
): Promise<GenerateMonthlyBillsResult> {
  return db.transaction(async (tx) => {
    // Serialize monthly generation runs to prevent races.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtext('baribondhu_monthly_bill_generation')
      )
    `);

    // Create bills using the current transaction.
    const result = await generateMonthlyBills(
      {
        store: databaseMonthlyBillStore(db, tx),

        // Audit is written inside the same transaction.
        audit: async (entry) => {
          await tx.insert(auditLogs).values(entry);
        },
      },
      input,
      managerId,
    );

    // Reject partial monthly generation.
    if (result.skippedCount > 0) {
      throw new AppError('CONFLICT', 'Some monthly bills already exist');
    }

    // Use the SAME transaction for carry forward.
    const carryForwardStore = databaseCarryForwardStore(db, tx, managerId);

    for (const bill of result.bills) {
      // BR-05: Carry forward earlier unpaid balances.
      await carryForwardUnpaidBills(
        {
          store: carryForwardStore,
        },
        bill.id,
      );
      // BR-07: Apply unused excess credit.
      // // Both operations use the same transaction.
      await applyExcessBillCredits(tx, bill.id, managerId);
    }

    // Return the final bill totals after carry forward.
    if (result.bills.length === 0) {
      return result;
    }

    const updatedBills = await tx
      .select()
      .from(bills)
      .where(
        inArray(
          bills.id,
          result.bills.map((bill) => bill.id),
        ),
      );

    const updatedById = new Map(updatedBills.map((bill) => [bill.id, bill]));

    return {
      ...result,
      bills: result.bills.map((bill) => updatedById.get(bill.id) ?? bill),
    };
  });
}
