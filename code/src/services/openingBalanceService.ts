/**
 * The opening balance of the first month (BM-12, CM-02): the manager enters it, the committee approves or rejects
 * it. The first fund summary can be published only after it is Approved (BM-12). A Rejected balance goes back to
 * Waiting for approval when the manager enters a corrected figure; Approved is final. Every change is written to
 * the audit log (NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import { AppError } from '@/lib/errors';
import type { NewOpeningBalance, OpeningBalance } from '@/models';
import type { AuditWriter } from '@/services/auditService';

/** Shown when the amount is blank or not a whole number of poisha, or below 0 (BM-12). */
export const INVALID_OPENING_BALANCE_MESSAGE = 'Enter the opening balance.';

/** Shown when the month is missing, not a date, or not the first day of a month. */
export const CHECK_BALANCE_MONTH_MESSAGE = 'Check the month';

/** Shown when the committee rejects an opening balance with no reason (CM-02). */
export const WRITE_BALANCE_REASON_MESSAGE = 'Write a reason';

/** The opening balance reads and writes this service needs. */
export interface OpeningBalanceStore {
  /** The opening balance with this id, or undefined. */
  findById(id: string): Promise<OpeningBalance | undefined>;
  /** The opening balance for this month (YYYY-MM-01), or undefined. */
  findByMonth(month: string): Promise<OpeningBalance | undefined>;
  /** Saves a new opening balance and returns it as stored. */
  insert(balance: NewOpeningBalance): Promise<OpeningBalance>;
  /** Changes some fields of an opening balance and returns it as stored. */
  update(id: string, changes: Partial<NewOpeningBalance>): Promise<OpeningBalance>;
  /** Every opening balance, newest month first. */
  list(): Promise<OpeningBalance[]>;
}

/** What the opening balance functions work with. */
export interface OpeningBalanceDeps {
  balances: OpeningBalanceStore;
  audit: AuditWriter;
}

/** What the manager entered. Blank fields are null. */
export interface OpeningBalanceInput {
  /** First day of the month, as YYYY-MM-01. */
  month: string | null;
  /** Balance at the start of the month in whole poisha. */
  amountPoisha: number | null;
  /** Where the figure comes from. */
  note: string | null;
}

/**
 * Whether the text is a real calendar date written as YYYY-MM-DD.
 * @param value - The text to check.
 * @returns True for a real date, false for 2026-02-30 or free text.
 */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The fields of an opening balance that go in the audit log.
 * @param balance - The opening balance.
 * @returns A plain object of its main fields.
 */
function snapshot(balance: OpeningBalance): Record<string, unknown> {
  return {
    month: balance.month,
    amountPoisha: balance.amountPoisha,
    note: balance.note,
    status: balance.status,
  };
}

/**
 * Finds an opening balance or fails.
 * @param deps - Opening balance store.
 * @param id - The opening balance id.
 * @returns The opening balance.
 * @throws AppError 404 if there is no such opening balance.
 */
async function getBalance(
  deps: Pick<OpeningBalanceDeps, 'balances'>,
  id: string,
): Promise<OpeningBalance> {
  const balance = await deps.balances.findById(id);
  if (!balance) throw new AppError('NOT_FOUND', 'This opening balance does not exist.');
  return balance;
}

/**
 * Refuses to decide an opening balance that is not waiting. The message shows its current status (CM-02).
 * @param balance - The opening balance.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
function requireWaiting(balance: OpeningBalance): void {
  if (balance.status !== 'Waiting for approval') {
    throw new AppError('CONFLICT', `This opening balance is already ${balance.status}.`);
  }
}

/**
 * Enters the opening balance of a month, or enters a corrected figure after a rejection. Either way it is
 * Waiting for approval afterwards (BM-12).
 * @param deps - Opening balance store and audit writer.
 * @param input - The entered fields.
 * @param actorId - The manager entering it.
 * @param now - The current time.
 * @returns The saved opening balance, Waiting for approval.
 * @throws AppError 400 if the amount is blank or not a whole number of poisha, or the month is not valid.
 * @throws AppError 409 if the month's balance is already waiting or Approved.
 */
export async function enterOpeningBalance(
  deps: OpeningBalanceDeps,
  input: OpeningBalanceInput,
  actorId: string,
  now: Date = new Date(),
): Promise<OpeningBalance> {
  const { month, amountPoisha } = input;
  if (amountPoisha === null || !Number.isInteger(amountPoisha) || amountPoisha < 0) {
    throw new AppError('BAD_REQUEST', INVALID_OPENING_BALANCE_MESSAGE);
  }
  if (month === null || !isRealDate(month) || !month.endsWith('-01')) {
    throw new AppError('BAD_REQUEST', CHECK_BALANCE_MONTH_MESSAGE);
  }
  const note = input.note?.trim() || null;

  const before = await deps.balances.findByMonth(month);
  if (before === undefined) {
    const created = await deps.balances.insert({
      month,
      amountPoisha,
      note,
      status: 'Waiting for approval',
      enteredBy: actorId,
    });
    await deps.audit({
      actorId,
      action: 'openingBalance.enter',
      entityType: 'opening_balances',
      entityId: created.id,
      oldValues: null,
      newValues: snapshot(created),
    });
    return created;
  }

  if (before.status !== 'Rejected') requireWaitingOrApprovedConflict(before);

  const after = await deps.balances.update(before.id, {
    amountPoisha,
    note,
    status: 'Waiting for approval',
    enteredBy: actorId,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'openingBalance.reenter',
    entityType: 'opening_balances',
    entityId: before.id,
    oldValues: { ...snapshot(before), decisionReason: before.decisionReason },
    newValues: snapshot(after),
  });
  return after;
}

/**
 * Refuses a new figure for a month whose balance is waiting or Approved.
 * @param balance - The existing opening balance.
 * @throws AppError 409 always, naming the current status.
 */
function requireWaitingOrApprovedConflict(balance: OpeningBalance): never {
  throw new AppError('CONFLICT', `This opening balance is already ${balance.status}.`);
}

/**
 * Approves an opening balance that is Waiting for approval. The first summary can be published after this (CM-02).
 * @param deps - Opening balance store and audit writer.
 * @param balanceId - The opening balance to approve.
 * @param actorId - The committee member approving it.
 * @param now - The current time.
 * @returns The Approved opening balance.
 * @throws AppError 404 if there is no such opening balance.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
export async function approveOpeningBalance(
  deps: OpeningBalanceDeps,
  balanceId: string,
  actorId: string,
  now: Date = new Date(),
): Promise<OpeningBalance> {
  const before = await getBalance(deps, balanceId);
  requireWaiting(before);

  const after = await deps.balances.update(balanceId, {
    status: 'Approved',
    decidedBy: actorId,
    decidedAt: now,
    decisionReason: null,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'openingBalance.approve',
    entityType: 'opening_balances',
    entityId: balanceId,
    oldValues: snapshot(before),
    newValues: snapshot(after),
  });
  return after;
}

/**
 * Rejects an opening balance that is Waiting for approval, with a reason. The manager sees the reason and enters
 * a corrected figure (CM-02).
 * @param deps - Opening balance store and audit writer.
 * @param balanceId - The opening balance to reject.
 * @param reason - Why it was rejected.
 * @param actorId - The committee member rejecting it.
 * @param now - The current time.
 * @returns The Rejected opening balance.
 * @throws AppError 400 "Write a reason" if the reason is empty.
 * @throws AppError 404 if there is no such opening balance.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
export async function rejectOpeningBalance(
  deps: OpeningBalanceDeps,
  balanceId: string,
  reason: string | null,
  actorId: string,
  now: Date = new Date(),
): Promise<OpeningBalance> {
  const decisionReason = reason?.trim() ?? '';
  if (decisionReason === '') throw new AppError('BAD_REQUEST', WRITE_BALANCE_REASON_MESSAGE);
  const before = await getBalance(deps, balanceId);
  requireWaiting(before);

  const after = await deps.balances.update(balanceId, {
    status: 'Rejected',
    decidedBy: actorId,
    decidedAt: now,
    decisionReason,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'openingBalance.reject',
    entityType: 'opening_balances',
    entityId: balanceId,
    oldValues: snapshot(before),
    newValues: { ...snapshot(after), decisionReason },
  });
  return after;
}

/**
 * Every opening balance, newest month first, for the manager's Fund page and the committee's decision screen.
 * @param deps - Opening balance store.
 * @returns All opening balances.
 */
export async function listOpeningBalances(
  deps: Pick<OpeningBalanceDeps, 'balances'>,
): Promise<OpeningBalance[]> {
  const all = await deps.balances.list();
  return [...all].sort((a, b) => b.month.localeCompare(a.month));
}
