/**
 * Apply excess credit from earlier corrected bills.
 *
 * BB-0508, BR-07, NFR-26, NFR-27.
 *
 * Runs inside the monthly generation transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills, billLineItems } from '@/models';

type BillTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const MIN_POISHA = -2147483648;
const MAX_POISHA = 2147483647;

/**
 * Apply unused credits belonging to the same occupancy.
 *
 * A source credit is recorded by a credit line item
 * containing the source bill ID.
 *
 * A negative resulting total remains available for
 * the following month's bill.
 */
export async function applyExcessBillCredits(
  tx: BillTransaction,
  targetBillId: string,
  managerId: string,
): Promise<number> {
  const [target] = await tx.select().from(bills).where(eq(bills.id, targetBillId));

  if (!target || !target.occupancyId) {
    return 0;
  }

  // Only newly generated, unsettled bills are eligible.
  if (target.status !== 'Unpaid' && !(target.status === 'Paid' && target.totalPoisha <= 0)) {
    return 0;
  }

  // Credits belong to the same household, never simply
  // to a flat or a previous household.
  const candidates = await tx
    .select()
    .from(bills)
    .where(
      and(
        eq(bills.occupancyId, target.occupancyId),
        eq(bills.flatId, target.flatId),
        lt(bills.billingMonth, target.billingMonth),
        eq(bills.status, 'Paid'),
        lt(bills.totalPoisha, 0),
      ),
    );

  if (candidates.length === 0) {
    return 0;
  }

  const sourceIds = candidates.map((bill) => bill.id);
  const lockIds = [targetBillId, ...sourceIds].sort((a, b) => a.localeCompare(b));

  // Lock source and target bills in a stable order.
  await tx.execute(sql`
    SELECT id
    FROM bills
    WHERE id IN (
      ${sql.join(
        lockIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}
    )
    ORDER BY id
    FOR UPDATE
  `);

  // Recheck the latest state after acquiring locks.
  const lockedBills = await tx.select().from(bills).where(inArray(bills.id, lockIds));

  const currentTarget = lockedBills.find((bill) => bill.id === targetBillId);

  if (
    !currentTarget ||
    currentTarget.occupancyId !== target.occupancyId ||
    currentTarget.flatId !== target.flatId ||
    (currentTarget.status !== 'Unpaid' &&
      !(currentTarget.status === 'Paid' && currentTarget.totalPoisha <= 0))
  ) {
    throw new AppError('CONFLICT', 'Target bill changed during credit application');
  }

  // A credit source must never be consumed twice.
  const existingCredits = await tx
    .select({
      sourceBillId: billLineItems.sourceBillId,
    })
    .from(billLineItems)
    .where(and(eq(billLineItems.type, 'credit'), inArray(billLineItems.sourceBillId, sourceIds)));

  const alreadyUsed = new Set(existingCredits.map((item) => item.sourceBillId));

  let total = currentTarget.totalPoisha;
  let status: 'Unpaid' | 'Paid' = currentTarget.status === 'Paid' ? 'Paid' : 'Unpaid';

  let appliedCreditPoisha = 0;

  for (const source of lockedBills) {
    if (
      source.id === targetBillId ||
      alreadyUsed.has(source.id) ||
      source.status !== 'Paid' ||
      source.totalPoisha >= 0 ||
      source.occupancyId !== currentTarget.occupancyId ||
      source.flatId !== currentTarget.flatId ||
      source.billingMonth >= currentTarget.billingMonth
    ) {
      continue;
    }

    const nextTotal = total + source.totalPoisha;

    if (!Number.isSafeInteger(nextTotal) || nextTotal < MIN_POISHA || nextTotal > MAX_POISHA) {
      throw new AppError('BAD_REQUEST', 'Credit amount exceeds the supported limit');
    }

    const nextStatus: 'Unpaid' | 'Paid' = nextTotal <= 0 ? 'Paid' : 'Unpaid';

    // Negative amount reduces the current bill.
    await tx.insert(billLineItems).values({
      billId: targetBillId,
      type: 'credit',
      amountPoisha: source.totalPoisha,
      sourceBillId: source.id,
      description: 'Excess credit from an earlier bill',
    });

    await tx.insert(auditLogs).values({
      actorId: managerId,
      action: 'bill.credit_apply',
      entityType: 'bills',
      entityId: targetBillId,
      oldValues: {
        totalPoisha: total,
        status,
      },
      newValues: {
        totalPoisha: nextTotal,
        status: nextStatus,
        sourceBillId: source.id,
        creditPoisha: -source.totalPoisha,
      },
    });

    appliedCreditPoisha += -source.totalPoisha;
    total = nextTotal;
    status = nextStatus;
  }

  if (appliedCreditPoisha > 0) {
    await tx
      .update(bills)
      .set({
        totalPoisha: total,
        status,
        updatedAt: new Date(),
      })
      .where(eq(bills.id, targetBillId));
  }

  return appliedCreditPoisha;
}
