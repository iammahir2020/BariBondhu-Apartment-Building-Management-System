/**
 * Database adapter for carrying forward unpaid bills.
 *
 * BB-0506, BB-0508, BR-05, NFR-26, NFR-27.
 *
 * Supports an optional shared transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills, billLineItems } from '@/models';

import type { CarryForwardOperation, CarryForwardStore } from '@/services/carryForwardBills';

type BillTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Creates a database-backed store for carrying forward bill balances.
 *
 * @param db - Database connection.
 * @param existingTx - Optional existing database transaction.
 * @param actorId - Optional actor ID for audit records.
 * @returns The carry-forward store implementation.
 */
export function databaseCarryForwardStore(
  db: Database,
  existingTx?: BillTransaction,
  actorId: string | null = null,
): CarryForwardStore {
  return {
    async findBillById(id) {
      const result = existingTx
        ? await existingTx.select().from(bills).where(eq(bills.id, id)).limit(1)
        : await db.select().from(bills).where(eq(bills.id, id)).limit(1);

      return result[0];
    },

    async listEarlierBills(occupancyId, beforeMonth) {
      const condition = and(
        eq(bills.occupancyId, occupancyId),
        lt(bills.billingMonth, beforeMonth),
      );

      return existingTx
        ? existingTx.select().from(bills).where(condition)
        : db.select().from(bills).where(condition);
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

      const apply = async (tx: BillTransaction): Promise<number> => {
        const ids = [targetBillId, ...sourceIds].sort((a, b) => a.localeCompare(b));

        // Lock affected bills in a consistent order.
        await tx.execute(sql`
          SELECT id
          FROM bills
          WHERE id IN (
            ${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )}
          )
          ORDER BY id
          FOR UPDATE
        `);

        const [target] = await tx.select().from(bills).where(eq(bills.id, targetBillId)).limit(1);

        if (!target) {
          throw new AppError('NOT_FOUND', 'Bill not found');
        }

        if (target.status !== 'Unpaid' || !target.occupancyId) {
          throw new AppError('CONFLICT', 'Target bill is not available for carry forward');
        }

        // Only the newest bill can receive old debt.
        const [newer] = await tx
          .select({ id: bills.id })
          .from(bills)
          .where(
            and(
              eq(bills.occupancyId, target.occupancyId),
              gt(bills.billingMonth, target.billingMonth),
            ),
          )
          .limit(1);

        if (newer) {
          throw new AppError('CONFLICT', 'Carry forward requires the newest bill');
        }

        const previousBills = await tx.select().from(bills).where(inArray(bills.id, sourceIds));

        if (previousBills.length !== sources.length) {
          throw new AppError('CONFLICT', 'One or more source bills are missing');
        }

        const amounts = new Map(
          sources.map((source) => [source.sourceBillId, source.amountPoisha]),
        );

        for (const source of previousBills) {
          if (
            source.status !== 'Unpaid' ||
            source.occupancyId !== target.occupancyId ||
            source.flatId !== target.flatId ||
            source.billingMonth >= target.billingMonth ||
            source.totalPoisha <= 0
          ) {
            throw new AppError('CONFLICT', 'Source bill is no longer eligible');
          }

          if (source.totalPoisha !== amounts.get(source.id)) {
            throw new AppError('CONFLICT', 'Source bill amount has changed');
          }
        }

        // Prevent transferring the same source twice.
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

        const carriedAmountPoisha = sources.reduce((sum, source) => sum + source.amountPoisha, 0);

        const newTotal = target.totalPoisha + carriedAmountPoisha;

        if (!Number.isSafeInteger(newTotal) || newTotal > 2147483647 || carriedAmountPoisha <= 0) {
          throw new AppError('BAD_REQUEST', 'The carried-forward amount is too large');
        }

        const now = new Date();

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
            totalPoisha: newTotal,
            updatedAt: now,
          })
          .where(eq(bills.id, targetBillId));

        await tx
          .update(bills)
          .set({
            status: 'Carried forward',
            updatedAt: now,
          })
          .where(inArray(bills.id, sourceIds));

        // Audit changes inside the same transaction.
        await tx.insert(auditLogs).values([
          ...previousBills.map((source) => ({
            actorId,
            action: 'bill.carry_forward',
            entityType: 'bills',
            entityId: source.id,
            oldValues: {
              status: source.status,
              totalPoisha: source.totalPoisha,
            },
            newValues: {
              status: 'Carried forward',
              totalPoisha: source.totalPoisha,
              amountPoisha: source.totalPoisha,
              targetBillId,
            },
          })),
          {
            actorId,
            action: 'bill.carry_forward',
            entityType: 'bills',
            entityId: targetBillId,
            oldValues: {
              status: target.status,
              totalPoisha: target.totalPoisha,
            },
            newValues: {
              status: target.status,
              totalPoisha: newTotal,
              carriedAmountPoisha,
              sourceBillIds: sourceIds,
            },
          },
        ]);

        return sources.length;
      };

      // BB-0508: Reuse the transaction when supplied.
      if (existingTx) {
        return apply(existingTx);
      }

      // BB-0506: Preserve standalone behaviour.
      return db.transaction(apply);
    },
  };
}
