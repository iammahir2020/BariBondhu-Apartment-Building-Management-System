/**
 * Carry forward unpaid bills (BB-0506, BR-05).
 *
 * Moves eligible earlier unpaid balances to the newest
 * unpaid bill belonging to the same occupancy.
 *
 * The database adapter is responsible for performing
 * all updates atomically and preventing duplicate transfers.
 *
 * @author Jannatul Ferdus Nishi
 */

import { AppError } from '@/lib/errors';
import type { Bill } from '@/models';
import { checkBillTransition } from '@/services/billStateMachine';

/**
 * One earlier unpaid bill to carry forward.
 */
export interface CarryForwardSource {
  /** ID of the previous unpaid bill. */
  sourceBillId: string;

  /** Amount to transfer, in whole poisha. */
  amountPoisha: number;
}

/**
 * The atomic database operation requested by the service.
 */
export interface CarryForwardOperation {
  /** ID of the bill receiving the unpaid balances. */
  targetBillId: string;

  /** Earlier bills whose balances must be transferred. */
  sources: CarryForwardSource[];
}

/**
 * Database operations required by the carry-forward service.
 *
 * applyCarryForward must use one database transaction,
 * recheck bill statuses and occupancy IDs, lock affected
 * bill rows, prevent duplicate source references, update
 * target totals, and mark the sources Carried forward.
 */
export interface CarryForwardStore {
  /**
   * Find a bill by its ID.
   * @param id - Bill ID.
   * @returns The bill, or undefined if missing.
   */
  findBillById(id: string): Promise<Bill | undefined>;

  /**
   * List previous bills belonging to one occupancy.
   * @param occupancyId - Household occupancy ID.
   * @param beforeMonth - Exclusive month boundary.
   * @returns Earlier bills of that occupancy.
   */
  listEarlierBills(occupancyId: string, beforeMonth: string): Promise<Bill[]>;

  /**
   * Apply the carry-forward changes atomically.
   * The adapter must revalidate the operation in its
   * transaction to handle concurrent payment changes.
   *
   * @param operation - Target and source bill details.
   * @returns The number of successfully transferred bills.
   */
  applyCarryForward(operation: CarryForwardOperation): Promise<number>;
}

/**
 * Dependencies used by the carry-forward service.
 */
export interface CarryForwardDeps {
  /** Database store for bill operations. */
  store: CarryForwardStore;
}

/**
 * Result of an attempted carry-forward operation.
 */
export interface CarryForwardResult {
  /** ID of the target bill. */
  targetBillId: string;

  /** Number of earlier bills transferred. */
  carriedCount: number;

  /** Total amount transferred, in poisha. */
  carriedAmountPoisha: number;
}

/**
 * Carry eligible earlier unpaid bills into a newer bill.
 *
 * A transfer is allowed only when:
 * - the target is Unpaid;
 * - the target belongs to an occupancy;
 * - the source is older than the target;
 * - both bills belong to the same flat and occupancy;
 * - the source is Unpaid and has a positive balance.
 *
 * The service validates candidates. The database store
 * must independently revalidate them inside a transaction.
 *
 * @param deps - Database dependencies.
 * @param targetBillId - Bill receiving earlier balances.
 * @returns The carry-forward summary.
 * @throws AppError when the target is missing or data is invalid.
 */
export async function carryForwardUnpaidBills(
  deps: CarryForwardDeps,
  targetBillId: string,
): Promise<CarryForwardResult> {
  const target = await deps.store.findBillById(targetBillId);

  if (!target) {
    throw new AppError('NOT_FOUND', 'Bill not found');
  }

  const emptyResult: CarryForwardResult = {
    targetBillId,
    carriedCount: 0,
    carriedAmountPoisha: 0,
  };

  // BR-05: Never change a bill already in a payment
  // flow or a final state.
  if (target.status !== 'Unpaid') {
    return emptyResult;
  }

  // A vacant flat has no household debt to carry.
  if (!target.occupancyId) {
    return emptyResult;
  }

  const earlierBills = await deps.store.listEarlierBills(target.occupancyId, target.billingMonth);

  const sources: CarryForwardSource[] = [];
  const seenIds = new Set<string>();

  for (const source of earlierBills) {
    // Prevent duplicate records in the source list.
    if (seenIds.has(source.id)) {
      throw new AppError('CONFLICT', 'Duplicate source bill found');
    }
    seenIds.add(source.id);

    // A previous household's debt is never transferable.
    if (source.occupancyId !== target.occupancyId || source.flatId !== target.flatId) {
      continue;
    }

    // Only earlier months can contribute to this bill.
    if (source.billingMonth >= target.billingMonth) {
      continue;
    }

    // Paid, pending, verification and previously carried
    // bills must not contribute again.
    if (source.status !== 'Unpaid') {
      continue;
    }

    if (!Number.isSafeInteger(source.totalPoisha) || source.totalPoisha < 0) {
      throw new AppError('CONFLICT', 'Invalid unpaid bill balance');
    }

    // Zero-value bills add no outstanding debt.
    if (source.totalPoisha === 0) {
      continue;
    }

    // The existing state machine authorizes this action.
    checkBillTransition(source.status, 'Carried forward', 'system', 'carry_forward');

    sources.push({
      sourceBillId: source.id,
      amountPoisha: source.totalPoisha,
    });
  }

  if (sources.length === 0) {
    return emptyResult;
  }

  const carriedAmountPoisha = sources.reduce((sum, source) => sum + source.amountPoisha, 0);

  // PostgreSQL integer amounts must stay within bounds.
  if (
    !Number.isSafeInteger(carriedAmountPoisha) ||
    !Number.isSafeInteger(target.totalPoisha) ||
    target.totalPoisha < 0 ||
    target.totalPoisha + carriedAmountPoisha > 2147483647
  ) {
    throw new AppError('BAD_REQUEST', 'The carried-forward amount is too large');
  }

  // This operation must be executed in one DB transaction.
  const carriedCount = await deps.store.applyCarryForward({
    targetBillId,
    sources,
  });

  if (carriedCount !== sources.length) {
    throw new AppError('CONFLICT', 'The unpaid bills changed during carry forward');
  }

  return {
    targetBillId,
    carriedCount,
    carriedAmountPoisha,
  };
}
