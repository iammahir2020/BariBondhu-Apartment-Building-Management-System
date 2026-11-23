/**
 * Reads the expense fields from a request body, so request data stays `unknown` until it is narrowed. It only
 * checks types; every rule (amount, date, description) is checked by `expenseService.ts`.
 *
 * @author Ayesha Siddiqa
 */
import type { UnknownObject } from '@/lib/parse';
import { EXPENSE_CATEGORIES, type ExpenseInput } from '@/services/expenseService';

/**
 * Narrows a JSON body to the fields of an expense. A field of the wrong type becomes null, so the service refuses it.
 * @param body - The parsed body.
 * @returns The fields, ready for the service.
 */
export function readExpenseInput(body: UnknownObject): ExpenseInput {
  return {
    amountPoisha: typeof body.amountPoisha === 'number' ? body.amountPoisha : null,
    expenseDate: typeof body.expenseDate === 'string' ? body.expenseDate.trim() : null,
    category: EXPENSE_CATEGORIES.find((category) => category === body.category) ?? null,
    description: typeof body.description === 'string' ? body.description : null,
    receiptPhoto: typeof body.receiptPhoto === 'string' ? body.receiptPhoto : null,
  };
}
