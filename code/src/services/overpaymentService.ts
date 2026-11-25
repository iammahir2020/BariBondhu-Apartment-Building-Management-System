/**
 * Overpayments for the manager (the overpayment part of BM-04, BR-04, BB-0613): a gateway payment that arrived for a
 * bill already settled another way is flagged by `paymentService.ts`. The manager returns the money outside the
 * app, then marks the overpayment Refunded here. States, from the Overpayment state diagram: Flagged → Refunded;
 * Refunded is final. The rest of BM-04 (cash and bank claims, feature 7) is not in Release 1.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { AuditWriter } from '@/services/auditService';
import type { Overpayment, Profile } from '@/models';

/** Error messages, shown as they are. */
export const OVERPAYMENT_ERRORS = {
  notFound: 'This overpayment does not exist.',
  alreadyRefunded: 'This overpayment is already marked Refunded.',
} as const;

/** One overpayment as the manager's list shows it. */
export interface OverpaymentRow {
  id: string;
  status: Overpayment['status'];
  amountPoisha: number;
  flaggedAt: Date;
  refundedAt: Date | null;
  /** Who marked it Refunded, or null while Flagged. */
  refundedByName: string | null;
  /** The bill's month, `YYYY-MM-01`. */
  billingMonth: string;
  /** Like `Block A, Flat 3B`. */
  flatLabel: string;
  /** The gateway's id for the payment, to find it in the gateway's records. */
  gatewayTransactionId: string;
}

/** Where overpayments are read and changed. */
export interface OverpaymentStore {
  /** Every overpayment, in any order. */
  list(): Promise<OverpaymentRow[]>;
  /** One overpayment's state, or null if there is none with this id. */
  findStatus(id: string): Promise<Overpayment['status'] | null>;
  /**
   * Marks a Flagged overpayment Refunded, only if it is still Flagged.
   * @returns True if it changed; false if it was no longer Flagged (someone else got there first).
   */
  markRefunded(id: string, refundedById: string, refundedAt: Date): Promise<boolean>;
}

/** What {@link refundOverpayment} needs. */
export interface OverpaymentDeps {
  overpayments: OverpaymentStore;
  audit: AuditWriter;
}

/**
 * Every overpayment: the Flagged ones first, oldest first, so the longest wait is handled first; then the Refunded
 * ones, newest refund first.
 * @param store - Where overpayments are read.
 * @returns The list.
 */
export async function listOverpayments(store: OverpaymentStore): Promise<OverpaymentRow[]> {
  const rows = await store.list();
  const flagged = rows
    .filter((row) => row.status === 'Flagged')
    .sort((a, b) => a.flaggedAt.getTime() - b.flaggedAt.getTime());
  const refunded = rows
    .filter((row) => row.status === 'Refunded')
    .sort((a, b) => (b.refundedAt?.getTime() ?? 0) - (a.refundedAt?.getTime() ?? 0));
  return [...flagged, ...refunded];
}

/**
 * Marks an overpayment Refunded once the manager has returned the money outside the app (BM-04, BR-04), and logs
 * who did it.
 * @param deps - The store and the audit log.
 * @param id - The overpayment.
 * @param manager - The manager marking it.
 * @param now - When it is marked.
 * @throws AppError 404 if there is no such overpayment.
 * @throws AppError 409 if it is already Refunded (Refunded is final).
 */
export async function refundOverpayment(
  deps: OverpaymentDeps,
  id: string,
  manager: Profile,
  now: Date,
): Promise<void> {
  const status = await deps.overpayments.findStatus(id);
  if (status === null) throw new AppError('NOT_FOUND', OVERPAYMENT_ERRORS.notFound);
  if (status === 'Refunded') {
    throw new AppError('CONFLICT', OVERPAYMENT_ERRORS.alreadyRefunded, { status });
  }
  const changed = await deps.overpayments.markRefunded(id, manager.id, now);
  if (!changed) {
    throw new AppError('CONFLICT', OVERPAYMENT_ERRORS.alreadyRefunded, { status: 'Refunded' });
  }
  await deps.audit({
    actorId: manager.id,
    action: 'overpayment.refunded',
    entityType: 'overpayments',
    entityId: id,
    oldValues: { status: 'Flagged' },
    newValues: { status: 'Refunded', refundedAt: now.toISOString() },
  });
}
