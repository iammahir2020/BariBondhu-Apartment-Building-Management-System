/**
 * What the committee member's home shows (BB-0011): the expenses waiting for a decision (CM-02) and the current
 * charge rates (CM-01), worked out from what `/api/expenses` and `/api/rates` send. Kept apart from the page so the
 * rules are tested on their own.
 *
 * @author Mahir Al Kamal
 */
import type { ChargeRate, Expense } from '@/models';

/** The expense fields the home shows. Dates arrive as text from the API. */
export type HomeExpense = Pick<
  Expense,
  'id' | 'description' | 'category' | 'expenseDate' | 'amountPoisha' | 'status'
>;

/** The rate fields the home shows. */
export type HomeRate = Pick<ChargeRate, 'chargeType' | 'amountPoisha' | 'meetingDate'>;

/** How many waiting expenses the home lists before "See all". */
export const WAITING_SHOWN = 3;

/** Expense categories as the Expenses page names them. */
export const EXPENSE_CATEGORY_LABELS: Readonly<Record<Expense['category'], string>> = {
  repair: 'Repair',
  salary: 'Salary',
  utility: 'Utility',
  other: 'Other',
};

/** Charge types as the Rates page names them, in the same order. */
export const CHARGE_LABELS: Readonly<Record<ChargeRate['chargeType'], string>> = {
  service: 'Service charge',
  generator: 'Generator',
  water: 'Water',
};

/** The expenses waiting for the committee: how many, and the first few to show. */
export interface Waiting {
  /** Every expense waiting for approval. */
  count: number;
  /** The oldest few, oldest first, so the longest wait is decided first. */
  shown: HomeExpense[];
}

/**
 * Picks the expenses still waiting for a decision.
 * @param expenses - Every expense, in any order.
 * @returns How many are waiting, and the oldest {@link WAITING_SHOWN}.
 */
export function waitingForDecision(expenses: readonly HomeExpense[]): Waiting {
  const waiting = expenses
    .filter((expense) => expense.status === 'Waiting for approval')
    .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  return { count: waiting.length, shown: waiting.slice(0, WAITING_SHOWN) };
}

/**
 * Puts the current rates in the Rates page's order: service charge, generator, water.
 * @param rates - The current rates, in any order.
 * @returns The same rates, ordered.
 */
export function orderRates(rates: readonly HomeRate[]): HomeRate[] {
  const order = Object.keys(CHARGE_LABELS);
  return [...rates].sort((a, b) => order.indexOf(a.chargeType) - order.indexOf(b.chargeType));
}
