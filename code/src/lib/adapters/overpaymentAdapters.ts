/**
 * Database adapter for `overpaymentService.ts`: reads overpayments with their bill, flat and payment, and marks one
 * Refunded. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '@/lib/db';
import { flatLabel } from '@/lib/flatLabel';
import { bills, blocks, flats, overpayments, payments, profiles } from '@/models';
import type { OverpaymentStore } from '@/services/overpaymentService';

/**
 * An {@link OverpaymentStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseOverpaymentStore(db: Database): OverpaymentStore {
  const refunder = alias(profiles, 'refunder');
  return {
    async list() {
      const rows = await db
        .select({
          id: overpayments.id,
          status: overpayments.status,
          amountPoisha: overpayments.amountPoisha,
          flaggedAt: overpayments.flaggedAt,
          refundedAt: overpayments.refundedAt,
          refundedByName: refunder.displayName,
          billingMonth: bills.billingMonth,
          blockName: blocks.name,
          flatNumber: flats.number,
          gatewayTransactionId: payments.gatewayTransactionId,
        })
        .from(overpayments)
        .innerJoin(bills, eq(overpayments.billId, bills.id))
        .innerJoin(flats, eq(bills.flatId, flats.id))
        .innerJoin(blocks, eq(flats.blockId, blocks.id))
        .innerJoin(payments, eq(overpayments.paymentId, payments.id))
        .leftJoin(refunder, eq(overpayments.refundedById, refunder.id));
      return rows.map(({ blockName, flatNumber, ...row }) => ({
        ...row,
        flatLabel: flatLabel(blockName, flatNumber),
      }));
    },
    async findStatus(id) {
      const [row] = await db
        .select({ status: overpayments.status })
        .from(overpayments)
        .where(eq(overpayments.id, id))
        .limit(1);
      return row?.status ?? null;
    },
    async markRefunded(id, refundedById, refundedAt) {
      const changed = await db
        .update(overpayments)
        .set({ status: 'Refunded', refundedById, refundedAt })
        .where(and(eq(overpayments.id, id), eq(overpayments.status, 'Flagged')))
        .returning({ id: overpayments.id });
      return changed.length > 0;
    },
  };
}
