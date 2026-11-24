/**
 * Monthly bill generation (BB-0505, BM-03).
 *
 * One monthly bill per flat, including vacant flats.
 * Rates are copied into bill line items.
 * The store must save a bill and its line items atomically.
 *
 * @author Jannatul Ferdus Nishi
 */

import { AppError } from '@/lib/errors';
import type { Bill, ChargeRate, Flat, NewBill, NewBillLineItem, Occupancy } from '@/models';
import { CHARGE_TYPES } from '@/services/chargeRateService';

/** Information required to generate a month's bills. */
export interface GenerateMonthlyBillsInput {
  billingMonth: string;
  dueDate: string;
}

/** A bill and its initial charge line items. */
export interface MonthlyBillDraft {
  bill: NewBill;
  lineItems: Omit<NewBillLineItem, 'billId'>[];
}

/**
 * Storage operations required for monthly bill generation.
 *
 * createMissing must:
 * - use one database transaction;
 * - rely on the unique (flatId, billingMonth) constraint;
 * - insert line items only for newly inserted bills;
 * - skip existing bills without changing them;
 * - roll back all inserts if any operation fails.
 */

/**
 * Database operations required for generating monthly bills.
 *
 * Implementations must ensure that bills and their line items
 * are inserted atomically and existing bills remain unchanged.
 */
export interface MonthlyBillStore {
  /**
   * Return all registered flats, including vacant flats.
   * @returns Every flat registered in the building.
   */
  listFlats(): Promise<Flat[]>;

  /**
   * Return occupancies that have not ended.
   * @returns All active occupancies.
   */
  listActiveOccupancies(): Promise<Occupancy[]>;

  /**
   * Return the currently approved charge rates.
   * @returns Current service, generator, and water rates.
   */
  listCurrentRates(): Promise<ChargeRate[]>;

  /**
   * Insert only bills that do not already exist.
   *
   * The bill and its line items must be saved in one
   * database transaction.
   *
   * @param drafts - Bills and line items prepared for insertion.
   * @returns Only the newly created bills.
   */
  createMissing(drafts: MonthlyBillDraft[]): Promise<Bill[]>;
}

/**
 * Dependencies required by the monthly bill generator.
 */
export interface GenerateMonthlyBillsDeps {
  /** Database store used to read and create monthly bills. */
  store: MonthlyBillStore;
}

/**
 * Result returned after monthly bill generation.
 */
export interface GenerateMonthlyBillsResult {
  /** The billing month in YYYY-MM-DD format. */
  billingMonth: string;

  /** Number of newly generated bills. */
  createdCount: number;

  /** Number of existing bills skipped. */
  skippedCount: number;

  /** Newly created bill records. */
  bills: Bill[];
}

/** Validate a real date in YYYY-MM-DD format. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Build and save monthly bills for all flats.
 *
 * BB-0506 will add carry-forward balances separately.
 */
export async function generateMonthlyBills(
  deps: GenerateMonthlyBillsDeps,
  input: GenerateMonthlyBillsInput,
): Promise<GenerateMonthlyBillsResult> {
  const { billingMonth, dueDate } = input;

  if (
    !isRealDate(billingMonth) ||
    !billingMonth.endsWith('-01') ||
    !isRealDate(dueDate) ||
    dueDate < billingMonth
  ) {
    throw new AppError('BAD_REQUEST', 'Enter a valid billing month and due date.');
  }

  const [flats, occupancies, rates] = await Promise.all([
    deps.store.listFlats(),
    deps.store.listActiveOccupancies(),
    deps.store.listCurrentRates(),
  ]);

  // All three approved rates must exist before generation.
  const currentRates = CHARGE_TYPES.map((type) => {
    const matches = rates.filter((rate) => rate.chargeType === type && rate.status === 'Current');

    if (matches.length !== 1) {
      throw new AppError(
        'BAD_REQUEST',
        `Set the current ${type} charge rate before generating bills.`,
      );
    }

    const rate = matches[0];

    if (!rate || !Number.isSafeInteger(rate.amountPoisha) || rate.amountPoisha < 0) {
      throw new AppError('BAD_REQUEST', `Invalid ${type} charge rate.`);
    }

    return rate;
  });

  const totalPoisha = currentRates.reduce((sum, rate) => sum + rate.amountPoisha, 0);

  if (!Number.isSafeInteger(totalPoisha) || totalPoisha > 2147483647) {
    throw new AppError('BAD_REQUEST', 'The monthly bill amount is too large.');
  }

  // A flat cannot have multiple active occupancies.
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

  // The database implementation must guarantee atomic,
  // concurrency-safe insertion.
  const created = await deps.store.createMissing(drafts);

  return {
    billingMonth,
    createdCount: created.length,
    skippedCount: drafts.length - created.length,
    bills: created,
  };
}
