/**
 * Working out a month of the fund summary (BM-12, BR-10): the opening balance, what was collected, what was spent
 * by category, the closing balance and the total outstanding. The figures are always the sum of the saved records
 * and each payment, expense and bill is counted exactly once (NFR-26). Months run on the Asia/Dhaka calendar
 * (BR-01). Publishing is in a separate step.
 *
 * @author Ayesha Siddiqa
 */
import { AppError } from '@/lib/errors';
import type { Bill, Expense, FundSummary } from '@/models';
import type { OpeningBalanceStore } from '@/services/openingBalanceService';

/** Shown when the month is not a real first day of a month. */
export const CHECK_FUND_MONTH_MESSAGE = 'Check the month';

/** Shown when no opening balance has been entered for the first month (BM-12). */
export const ENTER_OPENING_BALANCE_MESSAGE = 'Enter the opening balance first.';

/** Shown when the first month's opening balance is not Approved yet (BM-12, CM-02). */
export const APPROVE_OPENING_BALANCE_MESSAGE = 'The opening balance must be approved first.';

/** The bill states whose money is still owed. Carried forward is left out: its amount is in the next bill. */
export const UNPAID_BILL_STATUSES: readonly Bill['status'][] = [
  'Unpaid',
  'Payment pending',
  'Awaiting verification',
];

/** The figures read from the database for one month. */
export interface FundFigureStore {
  /** Payments the gateway confirmed from `from` (included) to `to` (excluded). */
  listConfirmedPayments(from: Date, to: Date): Promise<{ amountPoisha: number }[]>;
  /** Expenses dated from `from` (included) to `to` (excluded), as YYYY-MM-DD, with any status. */
  listExpensesDated(
    from: string,
    to: string,
  ): Promise<{ amountPoisha: number; category: Expense['category']; status: Expense['status'] }[]>;
  /** The bills made for this billing month (YYYY-MM-01). */
  listBillsOfMonth(month: string): Promise<{ totalPoisha: number; status: Bill['status'] }[]>;
  /** The saved summary of this month, or undefined. */
  findSummaryByMonth(month: string): Promise<FundSummary | undefined>;
}

/** What the month calculation works with. */
export interface FundFigureDeps {
  figures: FundFigureStore;
  balances: Pick<OpeningBalanceStore, 'findByMonth'>;
}

/** The worked-out figures of one month. All amounts are whole poisha. */
export interface MonthFigures {
  /** First day of the month, like 2026-10-01. */
  month: string;
  openingBalancePoisha: number;
  totalCollectedPoisha: number;
  spentRepairPoisha: number;
  spentSalaryPoisha: number;
  spentUtilityPoisha: number;
  spentOtherPoisha: number;
  /** Opening balance + collected - spent. */
  closingBalancePoisha: number;
  totalOutstandingPoisha: number;
}

/**
 * Whether the text is a real date that is the first day of a month.
 * @param value - The text to check.
 * @returns True for a date like 2026-10-01.
 */
function isFirstOfMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}-01$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Moves a first-of-month date by whole months.
 * @param month - A date like 2026-10-01.
 * @param count - Months to move; negative goes back.
 * @returns The new first-of-month date.
 */
function addMonths(month: string, count: number): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 10);
}

/**
 * The opening balance of a month: the previous month's closing balance, or for the first month the Approved
 * opening balance the manager entered (BR-10).
 * @param deps - Figure store and opening balance store.
 * @param month - First day of the month.
 * @returns The opening balance in poisha.
 * @throws AppError 409 if there is no opening balance yet, or it is not Approved.
 */
async function openingFor(deps: FundFigureDeps, month: string): Promise<number> {
  const previous = await deps.figures.findSummaryByMonth(addMonths(month, -1));
  if (previous !== undefined && previous.status !== 'Draft') return previous.closingBalancePoisha;

  const entered = await deps.balances.findByMonth(month);
  if (entered === undefined) throw new AppError('CONFLICT', ENTER_OPENING_BALANCE_MESSAGE);
  if (entered.status !== 'Approved')
    throw new AppError('CONFLICT', APPROVE_OPENING_BALANCE_MESSAGE);
  return entered.amountPoisha;
}

/**
 * Works out the fund figures of a month from the saved payments, Approved expenses and bills (BR-10). Payments
 * count by the date the gateway confirmed them and expenses by their expense date. Expenses that are Waiting for
 * approval or Rejected are left out, and a negative correcting expense reduces what was spent.
 * @param deps - Figure store and opening balance store.
 * @param month - First day of the month, like 2026-10-01.
 * @returns The month's figures.
 * @throws AppError 400 "Check the month" if the month is not the first day of a real month.
 * @throws AppError 409 if the month has no Approved opening balance to start from.
 */
export async function workOutMonth(deps: FundFigureDeps, month: string): Promise<MonthFigures> {
  if (!isFirstOfMonth(month)) throw new AppError('BAD_REQUEST', CHECK_FUND_MONTH_MESSAGE);
  const next = addMonths(month, 1);
  const openingBalancePoisha = await openingFor(deps, month);

  const from = new Date(`${month}T00:00:00+06:00`);
  const to = new Date(`${next}T00:00:00+06:00`);
  const [payments, expenses, bills] = await Promise.all([
    deps.figures.listConfirmedPayments(from, to),
    deps.figures.listExpensesDated(month, next),
    deps.figures.listBillsOfMonth(month),
  ]);

  const totalCollectedPoisha = payments.reduce((sum, row) => sum + row.amountPoisha, 0);
  const spent: Record<Expense['category'], number> = { repair: 0, salary: 0, utility: 0, other: 0 };
  for (const expense of expenses) {
    if (expense.status === 'Approved') spent[expense.category] += expense.amountPoisha;
  }
  const totalSpent = spent.repair + spent.salary + spent.utility + spent.other;
  const totalOutstandingPoisha = bills
    .filter((bill) => UNPAID_BILL_STATUSES.includes(bill.status))
    .reduce((sum, bill) => sum + bill.totalPoisha, 0);

  return {
    month,
    openingBalancePoisha,
    totalCollectedPoisha,
    spentRepairPoisha: spent.repair,
    spentSalaryPoisha: spent.salary,
    spentUtilityPoisha: spent.utility,
    spentOtherPoisha: spent.other,
    closingBalancePoisha: openingBalancePoisha + totalCollectedPoisha - totalSpent,
    totalOutstandingPoisha,
  };
}
