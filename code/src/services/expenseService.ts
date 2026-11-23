/**
 * Recording expenses (BM-08): the manager records an expense, edits it while it is waiting, resubmits it after the
 * committee rejected it, or adds a correcting expense to an Approved one. Every change is written to the audit
 * log (NFR-27). The committee approves or rejects an expense here too (CM-02).
 *
 * @author Ayesha Siddiqa
 */
import { AppError } from '@/lib/errors';
import type { Expense, NewExpense } from '@/models';
import type { AuditWriter } from '@/services/auditService';

/** What an expense was spent on. */
export type ExpenseCategory = Expense['category'];

/** All categories, as the SRS lists them (BM-08). */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'repair',
  'salary',
  'utility',
  'other',
];

/** Shown when the expense date is missing, not a date, or in the future (BM-08). */
export const CHECK_EXPENSE_DATE_MESSAGE = 'Check the expense date';

/** Shown when the amount, category or description is missing or not valid. */
export const INVALID_EXPENSE_MESSAGE = 'Enter an amount, a category and a description.';

/** Shown when the manager edits an expense that is Approved (BM-08, CM-02). */
export const APPROVED_EXPENSE_MESSAGE =
  'An approved expense cannot be changed. Add a correcting expense instead.';

/** Shown when an edit has no note (BM-08: the change is saved with a note). */
export const EDIT_NOTE_MESSAGE = 'Write a note about the change.';

/** The expense reads and writes this service needs. */
export interface ExpenseStore {
  /** The expense with this id, or undefined. */
  findById(id: string): Promise<Expense | undefined>;
  /** Saves a new expense and returns it as stored. */
  insert(expense: NewExpense): Promise<Expense>;
  /** Changes some fields of an expense and returns it as stored. */
  update(id: string, changes: Partial<NewExpense>): Promise<Expense>;
  /** Every expense, newest first. */
  list(): Promise<Expense[]>;
  /** Every expense, newest first. */
  list(): Promise<Expense[]>;
}

/** What the expense functions work with. */
export interface ExpenseDeps {
  expenses: ExpenseStore;
  audit: AuditWriter;
}

/** What the manager entered. Blank fields are null. */
export interface ExpenseInput {
  /** Amount in whole poisha. */
  amountPoisha: number | null;
  /** Expense date as YYYY-MM-DD. */
  expenseDate: string | null;
  category: ExpenseCategory | null;
  description: string | null;
  /** Optional receipt photo path or URL. */
  receiptPhoto?: string | null;
}

/** The checked fields of an expense. */
interface CleanExpense {
  amountPoisha: number;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  receiptPhoto: string | null;
}

/**
 * Today's date in Asia/Dhaka (BR-01), as YYYY-MM-DD.
 * @param now - The current time.
 * @returns The Dhaka date.
 */
function todayInDhaka(now: Date): string {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
 * Checks what the manager entered.
 * @param input - The entered fields.
 * @param kind - `normal` needs an amount above 0; `correcting` may be negative but not 0.
 * @param now - The current time, for the future-date check.
 * @returns The cleaned fields.
 * @throws AppError 400 if a field is missing or not valid, or the date is not a real past or present date.
 */
function clean(input: ExpenseInput, kind: 'normal' | 'correcting', now: Date): CleanExpense {
  const { amountPoisha, expenseDate, category } = input;
  const description = input.description?.trim() ?? '';
  const amountOk =
    amountPoisha !== null &&
    Number.isInteger(amountPoisha) &&
    (kind === 'normal' ? amountPoisha > 0 : amountPoisha !== 0);
  if (
    !amountOk ||
    category === null ||
    !EXPENSE_CATEGORIES.includes(category) ||
    description === ''
  ) {
    throw new AppError('BAD_REQUEST', INVALID_EXPENSE_MESSAGE);
  }
  if (expenseDate === null || !isRealDate(expenseDate) || expenseDate > todayInDhaka(now)) {
    throw new AppError('BAD_REQUEST', CHECK_EXPENSE_DATE_MESSAGE);
  }
  return {
    amountPoisha,
    expenseDate,
    category,
    description,
    receiptPhoto: input.receiptPhoto?.trim() || null,
  };
}

/**
 * The fields of an expense that go in the audit log.
 * @param expense - The expense.
 * @returns A plain object of its main fields.
 */
function snapshot(expense: Expense): Record<string, unknown> {
  return {
    amountPoisha: expense.amountPoisha,
    expenseDate: expense.expenseDate,
    category: expense.category,
    description: expense.description,
    receiptPhoto: expense.receiptPhoto,
    status: expense.status,
    correctsExpenseId: expense.correctsExpenseId,
  };
}

/**
 * Finds an expense or fails.
 * @param deps - Expense store.
 * @param id - The expense id.
 * @returns The expense.
 * @throws AppError 404 if there is no such expense.
 */
async function getExpense(deps: Pick<ExpenseDeps, 'expenses'>, id: string): Promise<Expense> {
  const expense = await deps.expenses.findById(id);
  if (!expense) throw new AppError('NOT_FOUND', 'This expense does not exist.');
  return expense;
}

/**
 * Records a new expense. It starts as Waiting for approval (BM-08).
 * @param deps - Expense store and audit writer.
 * @param input - The entered fields.
 * @param actorId - The manager recording it.
 * @param now - The current time.
 * @returns The saved expense.
 * @throws AppError 400 "Check the expense date" if the date is in the future or not a date.
 * @throws AppError 400 if the amount, category or description is missing or not valid.
 */
export async function recordExpense(
  deps: ExpenseDeps,
  input: ExpenseInput,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const fields = clean(input, 'normal', now);
  const created = await deps.expenses.insert({
    ...fields,
    status: 'Waiting for approval',
    recordedBy: actorId,
  });
  await deps.audit({
    actorId,
    action: 'expense.record',
    entityType: 'expenses',
    entityId: created.id,
    oldValues: null,
    newValues: snapshot(created),
  });
  return created;
}

/**
 * Edits an expense that is still Waiting for approval; the change is saved with a note (BM-08).
 * @param deps - Expense store and audit writer.
 * @param expenseId - The expense to edit.
 * @param input - The new fields.
 * @param note - Why it was changed.
 * @param actorId - The manager editing it.
 * @param now - The current time.
 * @returns The changed expense.
 * @throws AppError 404 if there is no such expense.
 * @throws AppError 409 if it is Approved or Rejected.
 * @throws AppError 400 for a missing note, a bad field, or "Check the expense date".
 */
export async function editExpense(
  deps: ExpenseDeps,
  expenseId: string,
  input: ExpenseInput,
  note: string | null,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const before = await getExpense(deps, expenseId);
  if (before.status === 'Approved') throw new AppError('CONFLICT', APPROVED_EXPENSE_MESSAGE);
  if (before.status === 'Rejected') {
    throw new AppError('CONFLICT', 'A rejected expense must be resubmitted, not edited.');
  }
  const editNote = note?.trim() ?? '';
  if (editNote === '') throw new AppError('BAD_REQUEST', EDIT_NOTE_MESSAGE);
  const kind = before.correctsExpenseId === null ? 'normal' : 'correcting';
  const fields = clean(input, kind, now);

  const after = await deps.expenses.update(expenseId, { ...fields, editNote, updatedAt: now });
  await deps.audit({
    actorId,
    action: 'expense.edit',
    entityType: 'expenses',
    entityId: expenseId,
    oldValues: snapshot(before),
    newValues: { ...snapshot(after), editNote },
  });
  return after;
}

/**
 * Resubmits a Rejected expense with corrected fields. It goes back to Waiting for approval and the earlier
 * decision is cleared from the row (it stays in the audit log) (BM-08).
 * @param deps - Expense store and audit writer.
 * @param expenseId - The rejected expense.
 * @param input - The corrected fields.
 * @param actorId - The manager resubmitting it.
 * @param now - The current time.
 * @returns The resubmitted expense.
 * @throws AppError 404 if there is no such expense.
 * @throws AppError 409 if it is not Rejected.
 * @throws AppError 400 for a bad field or "Check the expense date".
 */
export async function resubmitExpense(
  deps: ExpenseDeps,
  expenseId: string,
  input: ExpenseInput,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const before = await getExpense(deps, expenseId);
  if (before.status !== 'Rejected') {
    throw new AppError('CONFLICT', 'Only a rejected expense can be resubmitted.');
  }
  const kind = before.correctsExpenseId === null ? 'normal' : 'correcting';
  const fields = clean(input, kind, now);

  const after = await deps.expenses.update(expenseId, {
    ...fields,
    status: 'Waiting for approval',
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'expense.resubmit',
    entityType: 'expenses',
    entityId: expenseId,
    oldValues: { ...snapshot(before), decisionReason: before.decisionReason },
    newValues: snapshot(after),
  });
  return after;
}

/**
 * Adds a correcting expense that links to an Approved one. The amount may be negative. It needs approval like any
 * other expense (BM-08).
 * @param deps - Expense store and audit writer.
 * @param originalId - The Approved expense being corrected.
 * @param input - The correcting expense's fields.
 * @param actorId - The manager adding it.
 * @param now - The current time.
 * @returns The new correcting expense, Waiting for approval.
 * @throws AppError 404 if the original does not exist.
 * @throws AppError 409 if the original is not Approved.
 * @throws AppError 400 for a bad field (amount may not be 0) or "Check the expense date".
 */
export async function addCorrectingExpense(
  deps: ExpenseDeps,
  originalId: string,
  input: ExpenseInput,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const original = await getExpense(deps, originalId);
  if (original.status !== 'Approved') {
    throw new AppError('CONFLICT', 'Only an approved expense needs a correcting expense.');
  }
  const fields = clean(input, 'correcting', now);
  const created = await deps.expenses.insert({
    ...fields,
    status: 'Waiting for approval',
    correctsExpenseId: originalId,
    recordedBy: actorId,
  });
  await deps.audit({
    actorId,
    action: 'expense.correct',
    entityType: 'expenses',
    entityId: created.id,
    oldValues: null,
    newValues: snapshot(created),
  });
  return created;
}

/** Shown when the committee rejects an expense with no reason (CM-02). */
export const WRITE_REASON_MESSAGE = 'Write a reason';

/**
 * Refuses to decide an expense that is not waiting. The message shows its current status (CM-02).
 * @param expense - The expense.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
function requireWaiting(expense: Expense): void {
  if (expense.status !== 'Waiting for approval') {
    throw new AppError('CONFLICT', `This expense is already ${expense.status}.`);
  }
}

/**
 * Approves an expense that is Waiting for approval. From now on it counts in the fund summary (CM-02, BR-10).
 * @param deps - Expense store and audit writer.
 * @param expenseId - The expense to approve.
 * @param actorId - The committee member approving it.
 * @param now - The current time.
 * @returns The Approved expense.
 * @throws AppError 404 if there is no such expense.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
export async function approveExpense(
  deps: ExpenseDeps,
  expenseId: string,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const before = await getExpense(deps, expenseId);
  requireWaiting(before);

  const after = await deps.expenses.update(expenseId, {
    status: 'Approved',
    decidedBy: actorId,
    decidedAt: now,
    decisionReason: null,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'expense.approve',
    entityType: 'expenses',
    entityId: expenseId,
    oldValues: snapshot(before),
    newValues: snapshot(after),
  });
  return after;
}

/**
 * Rejects an expense that is Waiting for approval, with a reason. It does not count in the fund summary, and the
 * manager sees the reason (CM-02).
 * @param deps - Expense store and audit writer.
 * @param expenseId - The expense to reject.
 * @param reason - Why it was rejected.
 * @param actorId - The committee member rejecting it.
 * @param now - The current time.
 * @returns The Rejected expense.
 * @throws AppError 400 "Write a reason" if the reason is empty.
 * @throws AppError 404 if there is no such expense.
 * @throws AppError 409 if it is already Approved or Rejected.
 */
export async function rejectExpense(
  deps: ExpenseDeps,
  expenseId: string,
  reason: string | null,
  actorId: string,
  now: Date = new Date(),
): Promise<Expense> {
  const decisionReason = reason?.trim() ?? '';
  if (decisionReason === '') throw new AppError('BAD_REQUEST', WRITE_REASON_MESSAGE);
  const before = await getExpense(deps, expenseId);
  requireWaiting(before);

  const after = await deps.expenses.update(expenseId, {
    status: 'Rejected',
    decidedBy: actorId,
    decidedAt: now,
    decisionReason,
    updatedAt: now,
  });
  await deps.audit({
    actorId,
    action: 'expense.reject',
    entityType: 'expenses',
    entityId: expenseId,
    oldValues: snapshot(before),
    newValues: { ...snapshot(after), decisionReason },
  });
  return after;
}

/**
 * Every expense, newest first, for the manager's list and the committee's approval screen (BM-08, CM-02).
 * @param deps - Expense store.
 * @returns All expenses, including correcting ones.
 */
export async function listExpenses(deps: Pick<ExpenseDeps, 'expenses'>): Promise<Expense[]> {
  const all = await deps.expenses.list();
  return [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
