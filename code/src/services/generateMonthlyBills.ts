/**
 * Monthly bill generation (BB-0505, BM-03).
 *
 * Generates one bill for every flat, including vacant flats.
 * Current charge rates are copied into bill line items.
 *
 * @author Jannatul Ferdus Nishi
 */

import { AppError } from '@/lib/errors';
import type { Bill, ChargeRate, Flat, NewBill, NewBillLineItem, Occupancy } from '@/models';
import { CHARGE_TYPES } from '@/services/chargeRateService';
import type { AuditWriter } from '@/services/auditService';

/**
 * Input required for monthly bill generation.
 */
export interface GenerateMonthlyBillsInput {
  /** First day of the billing month, YYYY-MM-DD. */
  billingMonth: string;

  /** Payment due date, YYYY-MM-DD. */
  dueDate: string;
}

/**
 * A monthly bill and its initial line items.
 */
export interface MonthlyBillDraft {
  /** Bill information to insert. */
  bill: NewBill;

  /** Charge items to save with the bill. */
  lineItems: Omit<NewBillLineItem, 'billId'>[];
}

/**
 * Database operations needed for monthly bill generation.
 * Implementations must insert bills and line items atomically.
 */
export interface MonthlyBillStore {
  /**
   * Return every flat, including vacant flats.
   * @returns All registered flats.
   */
  listFlats(): Promise<Flat[]>;

  /**
   * Return occupancies without an end date.
   * @returns All active occupancies.
   */
  listActiveOccupancies(): Promise<Occupancy[]>;

  /**
   * Return currently approved charge rates.
   * @returns Current charge rates.
   */
  listCurrentRates(): Promise<ChargeRate[]>;

  /**
   * Check whether any bill already exists for a month.
   * @param billingMonth - First day of the billing month.
   * @returns True when the month already has bills.
   */
  monthHasBills(billingMonth: string): Promise<boolean>;

  /**
   * Create bills that are missing from the database.
   *
   * The implementation must use a database transaction,
   * preserve existing bills and prevent duplicate inserts.
   *
   * @param drafts - Prepared bills and their line items.
   * @returns Newly created bills only.
   */
  createMissing(drafts: MonthlyBillDraft[]): Promise<Bill[]>;
}

/**
 * Dependencies for monthly bill generation.
 */
export interface GenerateMonthlyBillsDeps {
  /** Database operations for bills and charge rates. */
  store: MonthlyBillStore;

  /** Records the manager's billing action. */
  audit: AuditWriter;
}

/**
 * Summary of a completed monthly bill generation.
 */
export interface GenerateMonthlyBillsResult {
  /** Billing month, YYYY-MM-DD. */
  billingMonth: string;

  /** Number of newly created bills. */
  createdCount: number;

  /** Number of bills skipped due to concurrent inserts. */
  skippedCount: number;

  /** Newly created bill records. */
  bills: Bill[];
}

/**
 * Check whether a string represents a real calendar date.
 *
 * @param value - Date string.
 * @returns True for a valid YYYY-MM-DD date.
 */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Generate monthly bills for all flats.
 *
 * Refuses a second run when bills already exist for the month.
 * Copies the three current rates into individual line items.
 * Writes one audit entry for the manager's generation action.
 *
 * @param deps - Bill store and audit writer.
 * @param input - Billing month and payment due date.
 * @param actorId - ID of the building manager.
 * @returns Generated bill summary.
 * @throws AppError if validation or billing rules fail.
 */
export async function generateMonthlyBills(
  deps: GenerateMonthlyBillsDeps,
  input: GenerateMonthlyBillsInput,
  actorId: string,
): Promise<GenerateMonthlyBillsResult> {
  const { billingMonth, dueDate } = input;

  // BM-03: The billing month must be a real first-of-month date.
  if (!isRealDate(billingMonth) || !billingMonth.endsWith('-01')) {
    throw new AppError('BAD_REQUEST', 'Enter a valid billing month');
  }

  // BM-03 c4: The due date must be valid and not before the month.
  if (!isRealDate(dueDate) || dueDate < billingMonth) {
    throw new AppError('BAD_REQUEST', 'Check the due date');
  }

  // BM-03 c3: Refuse to regenerate a month that has bills.
  if (await deps.store.monthHasBills(billingMonth)) {
    throw new AppError('CONFLICT', 'Bills for this month already exist');
  }

  const [flats, occupancies, rates] = await Promise.all([
    deps.store.listFlats(),
    deps.store.listActiveOccupancies(),
    deps.store.listCurrentRates(),
  ]);

  // BM-03 c4: Every required charge rate must be available.
  const currentRates = CHARGE_TYPES.map((type) => {
    const matches = rates.filter((rate) => rate.chargeType === type && rate.status === 'Current');

    if (matches.length !== 1) {
      throw new AppError('BAD_REQUEST', 'Ask the committee to set the charge rates first');
    }

    const rate = matches[0];

    if (!rate || !Number.isSafeInteger(rate.amountPoisha) || rate.amountPoisha < 0) {
      throw new AppError('BAD_REQUEST', 'Ask the committee to set the charge rates first');
    }

    return rate;
  });

  const totalPoisha = currentRates.reduce((sum, rate) => sum + rate.amountPoisha, 0);

  if (!Number.isSafeInteger(totalPoisha) || totalPoisha > 2147483647) {
    throw new AppError('BAD_REQUEST', 'The monthly bill amount is too large.');
  }

  // Each flat may have at most one active occupancy.
  const occupancyByFlat = new Map<string, Occupancy>();

  for (const occupancy of occupancies) {
    if (occupancy.endDate !== null) {
      throw new AppError('CONFLICT', 'The active occupancy list contains an ended household.');
    }

    if (occupancyByFlat.has(occupancy.flatId)) {
      throw new AppError('CONFLICT', 'A flat has more than one active occupancy.');
    }

    occupancyByFlat.set(occupancy.flatId, occupancy);
  }

  const uniqueFlatIds = new Set<string>();

  const drafts: MonthlyBillDraft[] = flats.map((flat) => {
    if (uniqueFlatIds.has(flat.id)) {
      throw new AppError('CONFLICT', 'The flat list contains duplicate records.');
    }

    uniqueFlatIds.add(flat.id);

    const occupancy = occupancyByFlat.get(flat.id);

    return {
      bill: {
        flatId: flat.id,
        occupancyId: occupancy?.id ?? null,
        billingMonth,
        dueDate,
        totalPoisha,
        status: totalPoisha === 0 ? 'Paid' : 'Unpaid',
      },
      lineItems: currentRates.map((rate) => ({
        type: rate.chargeType,
        amountPoisha: rate.amountPoisha,
        description: null,
        sourceBillId: null,
      })),
    };
  });

  // The database unique constraint remains a concurrency guard.
  const created = await deps.store.createMissing(drafts);

  // NFR-27: Record the manager's generation action.
  // NFR-27: Record the manager's generation action.

  // NFR-27: Record one audit entry for bill generation.
  if (created.length > 0) {
    await deps.audit({
      actorId,
      action: 'bills.generate',
      entityType: 'bills',
      entityId: created[0]!.id,
      oldValues: null,
      newValues: {
        billingMonth,
        dueDate,
        createdCount: created.length,
        skippedCount: drafts.length - created.length,
      },
    });
  }

  return {
    billingMonth,
    createdCount: created.length,
    skippedCount: drafts.length - created.length,
    bills: created,
  };
}
