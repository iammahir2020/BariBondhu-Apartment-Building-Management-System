/**
 * Charge rates (CM-01): a committee member sets a new rate for service, generator or water, and it replaces the
 * current one. The old rate stays as Replaced, so the rate history shows who changed what, when, and at which
 * meeting. Every change is written to the audit log (R-12, NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import { AppError } from '@/lib/errors';
import type { ChargeRate, NewChargeRate } from '@/models';
import type { AuditWriter } from '@/services/auditService';

/** The three charges a rate can be set for. */
export type ChargeType = ChargeRate['chargeType'];

/** All charge types, in the order they are shown on screen. */
export const CHARGE_TYPES: readonly ChargeType[] = ['service', 'generator', 'water'];

/** Shown when the rate is blank or negative, or the meeting date is missing (CM-01). */
export const INVALID_RATE_MESSAGE = 'Enter a valid rate and meeting date';

/** The rate reads and writes this service needs. */
export interface ChargeRateStore {
  /** The rows whose status is Current: at most one per charge type. */
  listCurrent(): Promise<ChargeRate[]>;
  /** Every rate ever set, Current and Replaced. */
  listAll(): Promise<ChargeRate[]>;
  /**
   * In one transaction: marks the Current row of this charge type as Replaced (if there is one) and saves the new
   * row as Current. Returns the replaced row (or null) and the new row.
   */
  replaceCurrent(
    rate: NewChargeRate,
  ): Promise<{ previous: ChargeRate | null; created: ChargeRate }>;
}

/** What the rate functions work with. */
export interface ChargeRateDeps {
  rates: ChargeRateStore;
  audit: AuditWriter;
}

/** What the committee member entered. */
export interface SetRateInput {
  chargeType: ChargeType;
  /** The rate in whole poisha; null when the field was left blank. */
  amountPoisha: number | null;
  /** Date of the meeting that agreed the rate, as YYYY-MM-DD; null when left out. */
  meetingDate: string | null;
}

/** One row of the rate history: one change of one rate. */
export interface RateHistoryEntry {
  id: string;
  chargeType: ChargeType;
  /** The rate before this change, or null for the first rate ever set. */
  oldAmountPoisha: number | null;
  newAmountPoisha: number;
  meetingDate: string;
  /** The committee member who entered the rate. */
  setBy: string;
  changedAt: Date;
}

/**
 * Whether the text is a real calendar date written as YYYY-MM-DD.
 * @param value - The text to check.
 * @returns True for a real date like 2026-11-20, false for 2026-02-30 or free text.
 */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Sets a new rate. It replaces the current rate of that charge type and is used for bills made after the save
 * (CM-01). Bills that already exist keep their old rates, because they store their own copy.
 * @param deps - Rate store and audit writer.
 * @param input - Charge type, rate in poisha and meeting date.
 * @param actorId - The committee member saving the rate.
 * @returns The new Current rate.
 * @throws AppError 400 "Enter a valid rate and meeting date" if the rate is blank, negative or not whole poisha,
 * the meeting date is missing or not a real date, or the charge type is unknown.
 */
export async function setRate(
  deps: ChargeRateDeps,
  input: SetRateInput,
  actorId: string,
): Promise<ChargeRate> {
  const { chargeType, amountPoisha, meetingDate } = input;
  if (
    !CHARGE_TYPES.includes(chargeType) ||
    amountPoisha === null ||
    !Number.isInteger(amountPoisha) ||
    amountPoisha < 0 ||
    meetingDate === null ||
    !isRealDate(meetingDate)
  ) {
    throw new AppError('BAD_REQUEST', INVALID_RATE_MESSAGE);
  }

  const { previous, created } = await deps.rates.replaceCurrent({
    chargeType,
    amountPoisha,
    meetingDate,
    setBy: actorId,
    status: 'Current',
  });

  await deps.audit({
    actorId,
    action: 'chargeRate.set',
    entityType: 'charge_rates',
    entityId: created.id,
    oldValues: previous
      ? {
          chargeType: previous.chargeType,
          amountPoisha: previous.amountPoisha,
          meetingDate: previous.meetingDate,
        }
      : null,
    newValues: {
      chargeType: created.chargeType,
      amountPoisha: created.amountPoisha,
      meetingDate: created.meetingDate,
    },
  });
  return created;
}

/**
 * The rates in use now, one per charge type that has a rate, in screen order.
 * @param deps - Rate store.
 * @returns The Current rates; empty if the committee has not set any yet.
 */
export async function getCurrentRates(deps: Pick<ChargeRateDeps, 'rates'>): Promise<ChargeRate[]> {
  const current = await deps.rates.listCurrent();
  return CHARGE_TYPES.flatMap((type) => current.filter((rate) => rate.chargeType === type));
}

/**
 * The rate history: every change with who made it, when, the meeting date, and the old and new values (CM-01).
 * @param deps - Rate store.
 * @returns The changes, newest first.
 */
export async function getRateHistory(
  deps: Pick<ChargeRateDeps, 'rates'>,
): Promise<RateHistoryEntry[]> {
  const all = await deps.rates.listAll();
  const entries: RateHistoryEntry[] = [];

  for (const type of CHARGE_TYPES) {
    const oldestFirst = all
      .filter((rate) => rate.chargeType === type)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let oldAmountPoisha: number | null = null;
    for (const rate of oldestFirst) {
      entries.push({
        id: rate.id,
        chargeType: rate.chargeType,
        oldAmountPoisha,
        newAmountPoisha: rate.amountPoisha,
        meetingDate: rate.meetingDate,
        setBy: rate.setBy,
        changedAt: rate.createdAt,
      });
      oldAmountPoisha = rate.amountPoisha;
    }
  }
  return entries.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
}
