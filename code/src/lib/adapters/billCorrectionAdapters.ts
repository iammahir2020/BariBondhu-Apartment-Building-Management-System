/**
 * Database adapter for correcting unpaid bills.
 *
 * BB-0507, BM-03, BR-07, NFR-26, NFR-27.
 *
 * Business rules and calculations belong to the service.
 * This adapter locks the bill, verifies its current state,
 * and saves the correction and audit entry atomically.
 *
 * @author Jannatul Ferdus Nishi
 */

import { eq, sql } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { auditLogs, bills, billLineItems } from '@/models';

import type {
  BillCorrectionOperation,
  BillCorrectionResult,
  BillCorrectionStore,
} from '@/services/billCorrectionService';

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
      return db.transaction(async (tx) => {
        const {
          billId,
          managerId,
          adjustmentPoisha,
          reason,
          expectedTotalPoisha,
          newTotalPoisha,
          newStatus,
          excessCreditPoisha,
        } = operation;

        // Lock the bill to prevent concurrent corrections.
        await tx.execute(sql`
          SELECT id
          FROM bills
          WHERE id = ${billId}::uuid
          FOR UPDATE
        `);

        // Re-read the latest bill inside the transaction.
        const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);

        if (!bill) {
          throw new AppError('NOT_FOUND', 'Bill not found');
        }

        // Recheck the state after acquiring the lock.
        if (bill.status !== 'Unpaid') {
          throw new AppError('CONFLICT', 'Only Unpaid bills can be corrected');
        }

        // Reject stale corrections.
        if (bill.totalPoisha !== expectedTotalPoisha) {
          throw new AppError('CONFLICT', 'Bill total changed during correction');
        }

        // The service has already validated and calculated:
        // adjustmentPoisha, newTotalPoisha, newStatus,
        // excessCreditPoisha and reason.

        // Save the signed adjustment.
        await tx.insert(billLineItems).values({
          billId,
          type: 'adjustment',
          amountPoisha: adjustmentPoisha,
          description: reason,
        });

        // Save the service-calculated total and status.
        await tx
          .update(bills)
          .set({
            totalPoisha: newTotalPoisha,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(bills.id, billId));

        // NFR-27: Save the audit entry in the same transaction.
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
            totalPoisha: newTotalPoisha,
            status: newStatus,
            adjustmentPoisha,
            excessCreditPoisha,
            reason,
          },
        });

        return {
          billId,
          previousTotalPoisha: bill.totalPoisha,
          newTotalPoisha,
          adjustmentPoisha,
          excessCreditPoisha,
          status: newStatus,
        };
      });
    },
  };
}
