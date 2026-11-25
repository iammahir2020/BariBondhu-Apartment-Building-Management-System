/**
 * Database adapter for correcting unpaid bills.
 *
 * BB-0507, BM-03, BR-07, NFR-26, NFR-27.
 *
 * Adjustment, bill update and audit log are saved
 * within the same database transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import { eq, sql } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills, billLineItems } from '@/models';

import { checkBillTransition } from '@/services/billStateMachine';

import type {
  BillCorrectionOperation,
  BillCorrectionResult,
  BillCorrectionStore,
} from '@/services/billCorrectionService';

const MAX_POISHA = 2147483647;
const MIN_POISHA = -2147483648;

/**
 * Creates a database-backed bill correction store.
 */
export function databaseBillCorrectionStore(db: Database): BillCorrectionStore {
  return {
    async findBillById(id) {
      const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);

      return bill;
    },

    async applyCorrection(operation: BillCorrectionOperation): Promise<BillCorrectionResult> {
      const { billId, managerId, adjustmentPoisha, expectedTotalPoisha, reason } = operation;

      const trimmedReason = reason.trim();

      if (!billId || !managerId || !trimmedReason) {
        throw new AppError('BAD_REQUEST', 'Bill, manager and reason are required');
      }

      if (
        !Number.isSafeInteger(adjustmentPoisha) ||
        adjustmentPoisha === 0 ||
        adjustmentPoisha < MIN_POISHA ||
        adjustmentPoisha > MAX_POISHA
      ) {
        throw new AppError('BAD_REQUEST', 'Enter a valid adjustment amount');
      }

      return db.transaction(async (tx) => {
        // Prevent concurrent corrections of the same bill.
        await tx.execute(sql`
          SELECT id
          FROM bills
          WHERE id = ${billId}::uuid
          FOR UPDATE
        `);

        const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);

        if (!bill) {
          throw new AppError('NOT_FOUND', 'Bill not found');
        }

        if (bill.status !== 'Unpaid') {
          throw new AppError('CONFLICT', 'Only Unpaid bills can be corrected');
        }

        if (
          !Number.isSafeInteger(bill.totalPoisha) ||
          bill.totalPoisha < 0 ||
          bill.totalPoisha > MAX_POISHA
        ) {
          throw new AppError('CONFLICT', 'Invalid bill total');
        }

        if (bill.totalPoisha !== expectedTotalPoisha) {
          throw new AppError('CONFLICT', 'Bill total changed during correction');
        }

        const calculatedTotal = bill.totalPoisha + adjustmentPoisha;

        if (
          !Number.isSafeInteger(calculatedTotal) ||
          calculatedTotal < MIN_POISHA ||
          calculatedTotal > MAX_POISHA
        ) {
          throw new AppError(
            'BAD_REQUEST',
            'The corrected bill amount is outside the allowed range',
          );
        }

        // BR-07:
        // Zero or negative totals settle the bill.
        // A negative total represents credit to be
        // applied to a future bill or refunded.
        const newStatus: 'Unpaid' | 'Paid' = calculatedTotal <= 0 ? 'Paid' : 'Unpaid';

        const excessCreditPoisha = Math.max(0, -calculatedTotal);

        if (newStatus === 'Paid') {
          checkBillTransition('Unpaid', 'Paid', 'manager', 'settle_zero_balance');
        }

        if (
          operation.newTotalPoisha !== calculatedTotal ||
          operation.newStatus !== newStatus ||
          operation.excessCreditPoisha !== excessCreditPoisha
        ) {
          throw new AppError('CONFLICT', 'Correction details have changed');
        }

        // Preserve the signed adjustment.
        // This keeps the bill total consistent
        // with its line items.
        await tx.insert(billLineItems).values({
          billId,
          type: 'adjustment',
          amountPoisha: adjustmentPoisha,
          description: trimmedReason,
        });

        // A negative total is retained as the
        // source of future credit.
        await tx
          .update(bills)
          .set({
            totalPoisha: calculatedTotal,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(bills.id, billId));

        // Audit log is part of the same transaction.
        await tx.insert(auditLogs).values({
          actorId: managerId,
          action: 'bill.correct',
          entityType: 'bills',
          entityId: billId,
          oldValues: {
            totalPoisha: bill.totalPoisha,
            status: bill.status,
          },
          newValues: {
            totalPoisha: calculatedTotal,
            status: newStatus,
            adjustmentPoisha,
            excessCreditPoisha,
            reason: trimmedReason,
          },
        });

        return {
          billId,
          previousTotalPoisha: bill.totalPoisha,
          newTotalPoisha: calculatedTotal,
          adjustmentPoisha,
          excessCreditPoisha,
          status: newStatus,
        };
      });
    },
  };
}
