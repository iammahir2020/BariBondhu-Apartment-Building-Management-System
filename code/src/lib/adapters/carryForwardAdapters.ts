/**
 * Database adapter for carrying forward unpaid bills.
 * BB-0506, BR-05, NFR-26, NFR-27.
 *
 * The service selects eligible bills and validates business rules.
 * This adapter locks affected rows, rechecks mutable state,
 * and writes bill changes and audit entries atomically.
 *
 * @author Jannatul Ferdus Nishi
 */

import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills, billLineItems } from '@/models';

import type { CarryForwardOperation, CarryForwardStore } from '@/services/carryForwardBills';

/**
 * Create the database implementation of the carry-forward store.
 *
 * @param db - Application database connection.
 * @returns Database-backed carry-forward store.
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

      return db.transaction(async (tx) => {
        // Lock affected bills in a consistent order.
        const affectedIds = [targetBillId, ...sourceIds].sort((a, b) => a.localeCompare(b));

        await tx.execute(sql`
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
        `);

        // Re-read the target after locking.
        const [target] = await tx.select().from(bills).where(eq(bills.id, targetBillId)).limit(1);

        if (!target) {
          throw new AppError('NOT_FOUND', 'Bill not found');
        }

        if (target.status !== 'Unpaid' || !target.occupancyId) {
          throw new AppError('CONFLICT', 'Target bill is not available for carry forward');
        }

        // Recheck that the target is still the newest bill.
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

        // Re-read source bills after locking.
        const previousBills = await tx.select().from(bills).where(inArray(bills.id, sourceIds));

        if (previousBills.length !== sources.length) {
          throw new AppError('CONFLICT', 'One or more source bills are missing');
        }

        const amountById = new Map(
          sources.map((source) => [source.sourceBillId, source.amountPoisha]),
        );

        for (const source of previousBills) {
          if (source.status !== 'Unpaid') {
            throw new AppError('CONFLICT', 'Source bill is no longer eligible');
          }

          if (source.totalPoisha !== amountById.get(source.id)) {
            throw new AppError('CONFLICT', 'Source bill amount has changed');
          }
        }

        // Prevent reusing an already carried source.
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

        const newTargetTotalPoisha = target.totalPoisha + carriedAmountPoisha;

        const now = new Date();

        // Save the carried-forward line items.
        await tx.insert(billLineItems).values(
          sources.map((source) => ({
            billId: targetBillId,
            type: 'carried_forward' as const,
            amountPoisha: source.amountPoisha,
            sourceBillId: source.sourceBillId,
            description: 'Carried forward from an earlier unpaid bill',
          })),
        );

        // Update the receiving bill.
        await tx
          .update(bills)
          .set({
            totalPoisha: newTargetTotalPoisha,
            updatedAt: now,
          })
          .where(eq(bills.id, targetBillId));

        // Close the source bills.
        await tx
          .update(bills)
          .set({
            status: 'Carried forward',
            updatedAt: now,
          })
          .where(inArray(bills.id, sourceIds));

        // NFR-27:
        // Audit every changed source and target bill.
        // System-triggered carry forward uses actorId null.
        // BB-0508 will integrate the initiating manager.
        await tx.insert(auditLogs).values([
          ...previousBills.map((source) => ({
            actorId: null,
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
              targetBillId,
              amountPoisha: source.totalPoisha,
            },
          })),
          {
            actorId: null,
            action: 'bill.carry_forward',
            entityType: 'bills',
            entityId: targetBillId,
            oldValues: {
              status: target.status,
              totalPoisha: target.totalPoisha,
            },
            newValues: {
              status: target.status,
              totalPoisha: newTargetTotalPoisha,
              carriedAmountPoisha,
              sourceBillIds: sourceIds,
            },
          },
        ]);

        return sources.length;
      });
    },
  };
}
