/**
 * Database adapter for unpaid bill carry-forward operations.
 *
 * BB-0506, BR-05, NFR-26.
 *
 * All writes are performed inside a single transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { AppError } from '@/lib/errors';
import type { Database } from '@/lib/db';
import { bills, billLineItems } from '@/models';

import type { CarryForwardOperation, CarryForwardStore } from '@/services/carryForwardBills';

import { checkBillTransition } from '@/services/billStateMachine';

const MAX_POISHA = 2147483647;

/**
 * Create the database implementation of CarryForwardStore.
 *
 * @param db - Application database connection.
 * @returns Store implementing atomic carry-forward operations.
 */
export function databaseCarryForwardStore(db: Database): CarryForwardStore {
  return {
    async findBillById(id) {
      const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);

      return bill;
    },

    async listEarlierBills(occupancyId, beforeMonth) {
      return db
        .select()
        .from(bills)
        .where(and(eq(bills.occupancyId, occupancyId), lt(bills.billingMonth, beforeMonth)));
    },

    async applyCarryForward(operation: CarryForwardOperation): Promise<number> {
      const { targetBillId, sources } = operation;

      if (sources.length === 0) {
        return 0;
      }

      const sourceIds = sources.map((source) => source.sourceBillId);

      if (new Set(sourceIds).size !== sourceIds.length || sourceIds.includes(targetBillId)) {
        throw new AppError('CONFLICT', 'Duplicate or invalid source bill');
      }

      // Both source and target changes are committed
      // together or rolled back together.
      return db.transaction(async (tx) => {
        const affectedIds = [targetBillId, ...sourceIds].sort();

        // Lock all affected bills in a consistent order.
        // Concurrent payment and carry-forward writers
        // must use compatible row-locking discipline.
        await tx.execute(
          sql`
            SELECT id
            FROM bills
            WHERE id IN (
              ${sql.join(
                affectedIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )}
            )
            ORDER BY id
            FOR UPDATE
          `,
        );

        const [target] = await tx.select().from(bills).where(eq(bills.id, targetBillId)).limit(1);

        if (!target) {
          throw new AppError('NOT_FOUND', 'Bill not found');
        }

        if (target.status !== 'Unpaid' || !target.occupancyId) {
          throw new AppError('CONFLICT', 'Target bill is not available for carry forward');
        }

        // BR-05: Transfer to the newest bill only.
        const [newerBill] = await tx
          .select({ id: bills.id })
          .from(bills)
          .where(
            and(
              eq(bills.occupancyId, target.occupancyId),
              gt(bills.billingMonth, target.billingMonth),
            ),
          )
          .limit(1);

        if (newerBill) {
          throw new AppError('CONFLICT', 'Carry forward requires the newest bill');
        }

        const previousBills = await tx.select().from(bills).where(inArray(bills.id, sourceIds));

        if (previousBills.length !== sources.length) {
          throw new AppError('CONFLICT', 'One or more source bills are missing');
        }

        const amountById = new Map(
          sources.map((source) => [source.sourceBillId, source.amountPoisha]),
        );

        let carriedAmountPoisha = 0;

        for (const source of previousBills) {
          if (
            source.status !== 'Unpaid' ||
            source.occupancyId !== target.occupancyId ||
            source.flatId !== target.flatId ||
            source.billingMonth >= target.billingMonth
          ) {
            throw new AppError('CONFLICT', 'Source bill is no longer eligible');
          }

          const expectedAmount = amountById.get(source.id);

          if (
            expectedAmount === undefined ||
            !Number.isSafeInteger(expectedAmount) ||
            expectedAmount <= 0 ||
            expectedAmount !== source.totalPoisha
          ) {
            throw new AppError('CONFLICT', 'Source bill amount has changed');
          }

          checkBillTransition(source.status, 'Carried forward', 'system', 'carry_forward');

          carriedAmountPoisha += expectedAmount;
        }

        if (
          !Number.isSafeInteger(carriedAmountPoisha) ||
          !Number.isSafeInteger(target.totalPoisha) ||
          target.totalPoisha < 0 ||
          target.totalPoisha + carriedAmountPoisha > MAX_POISHA
        ) {
          throw new AppError('BAD_REQUEST', 'The carried-forward amount is too large');
        }

        // NFR-26: A source bill must never be
        // carried forward more than once.
        const existingLines = await tx
          .select({
            sourceBillId: billLineItems.sourceBillId,
          })
          .from(billLineItems)
          .where(
            and(
              eq(billLineItems.type, 'carried_forward'),
              inArray(billLineItems.sourceBillId, sourceIds),
            ),
          );

        if (existingLines.length > 0) {
          throw new AppError('CONFLICT', 'Bill was already carried forward');
        }

        // One line for each earlier unpaid bill,
        // retaining its original source bill ID.
        await tx.insert(billLineItems).values(
          sources.map((source) => ({
            billId: targetBillId,
            type: 'carried_forward' as const,
            amountPoisha: source.amountPoisha,
            sourceBillId: source.sourceBillId,
            description: 'Carried forward from an earlier unpaid bill',
          })),
        );

        await tx
          .update(bills)
          .set({
            totalPoisha: target.totalPoisha + carriedAmountPoisha,
            updatedAt: new Date(),
          })
          .where(eq(bills.id, targetBillId));

        await tx
          .update(bills)
          .set({
            status: 'Carried forward',
            updatedAt: new Date(),
          })
          .where(inArray(bills.id, sourceIds));

        return sources.length;
      });
    },
  };
}
