/**
 * Correct an unpaid monthly bill.
 *
 * BB-0507, BM-03, BR-07, NFR-27.
 *
 * A manager can correct an Unpaid bill by adding a
 * signed adjustment with a mandatory reason.
 *
 * Database updates and audit logging must be atomic.
 *
 * @author Jannatul Ferdus Nishi
 */

import { AppError } from '@/lib/errors';
import type { Bill } from '@/models';
import { checkBillTransition } from '@/services/billStateMachine';

const MAX_POISHA = 2147483647;
const MIN_POISHA = -2147483648;

/** Input for a bill correction. */
export interface BillCorrectionInput {
  /** Bill to correct. */
  billId: string;

  /** Manager account performing the correction. */
  managerId: string;

  /** Signed adjustment in poisha. */
  adjustmentPoisha: number;

  /** Mandatory explanation of the correction. */
  reason: string;
}

/** Atomic correction operation for the database adapter. */
export interface BillCorrectionOperation {
  /** Target bill ID. */
  billId: string;

  /** Acting manager ID for the audit record. */
  managerId: string;

  /** Adjustment amount in poisha. */
  adjustmentPoisha: number;

  /** Explanation recorded with the adjustment. */
  reason: string;

  /** Original total used for concurrency validation. */
  expectedTotalPoisha: number;

  /** Final total after applying the adjustment. */
  newTotalPoisha: number;

  /** Final bill status. */
  newStatus: 'Unpaid' | 'Paid';

  /** Excess credit when an adjustment exceeds the balance. */
  excessCreditPoisha: number;
}

/** Result returned after a successful correction. */
export interface BillCorrectionResult {
  /** Corrected bill ID. */
  billId: string;

  /** Total before correction. */
  previousTotalPoisha: number;

  /** Total after correction. */
  newTotalPoisha: number;

  /** Applied adjustment amount. */
  adjustmentPoisha: number;

  /** Excess credit, if any. */
  excessCreditPoisha: number;

  /** Updated bill status. */
  status: 'Unpaid' | 'Paid';
}

/**
 * Storage dependency for correction operations.
 *
 * Implementations must verify the latest bill status
 * and total under a database row lock, then save the
 * adjustment and audit entry in one transaction.
 */
export interface BillCorrectionStore {
  /**
   * Find a bill by ID.
   * @param id - Target bill ID.
   * @returns Bill record or undefined.
   */
  findBillById(id: string): Promise<Bill | undefined>;

  /**
   * Apply a correction in one transaction.
   * The adapter must revalidate all business rules.
   *
   * @param operation - Correction operation.
   * @returns Saved correction result.
   */
  applyCorrection(operation: BillCorrectionOperation): Promise<BillCorrectionResult>;
}

/** Dependencies for the correction service. */
export interface BillCorrectionDeps {
  /** Database implementation. */
  store: BillCorrectionStore;
}

/**
 * Correct an existing Unpaid bill.
 *
 * Positive adjustments increase the bill total.
 * Negative adjustments decrease the bill total.
 * A zero or negative calculated balance settles the bill.
 *
 * @param deps - Injected dependencies.
 * @param input - Correction request.
 * @returns Saved correction result.
 */
export async function correctUnpaidBill(
  deps: BillCorrectionDeps,
  input: BillCorrectionInput,
): Promise<BillCorrectionResult> {
  const billId = input.billId?.trim();
  const managerId = input.managerId?.trim();
  const reason = input.reason?.trim();

  if (!billId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Bill and manager are required');
  }

  if (!reason) {
    throw new AppError('BAD_REQUEST', 'Write a reason');
  }

  if (
    !Number.isSafeInteger(input.adjustmentPoisha) ||
    input.adjustmentPoisha < MIN_POISHA ||
    input.adjustmentPoisha > MAX_POISHA
  ) {
    throw new AppError('BAD_REQUEST', 'Enter a valid adjustment amount');
  }

  if (input.adjustmentPoisha === 0) {
    throw new AppError('BAD_REQUEST', 'Adjustment amount cannot be zero');
  }

  const bill = await deps.store.findBillById(billId);

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

  const calculatedTotal = bill.totalPoisha + input.adjustmentPoisha;

  if (!Number.isSafeInteger(calculatedTotal) || calculatedTotal > MAX_POISHA) {
    throw new AppError('BAD_REQUEST', 'The corrected bill amount is too large');
  }

  // Preserve the signed total so excess credit is not lost.
  const newTotalPoisha = calculatedTotal;
  const excessCreditPoisha = Math.max(0, -calculatedTotal);

  const newStatus: 'Unpaid' | 'Paid' = calculatedTotal <= 0 ? 'Paid' : 'Unpaid';

  if (newStatus === 'Paid') {
    checkBillTransition('Unpaid', 'Paid', 'manager', 'settle_zero_balance');
  }

  // The adapter must recheck the bill after locking it
  // and atomically save the adjustment, total, status,
  // excess credit information and audit record.
  return deps.store.applyCorrection({
    billId,
    managerId,
    adjustmentPoisha: input.adjustmentPoisha,
    reason,
    expectedTotalPoisha: bill.totalPoisha,
    newTotalPoisha,
    newStatus,
    excessCreditPoisha,
  });
}
