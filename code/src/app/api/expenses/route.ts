/**
 * Expenses (BM-08, CM-02): the list for the manager and the committee (GET), and recording a new expense by the
 * manager (POST). The role check is the first line of each handler.
 *
 * @author Ayesha Siddiqa
 */
import { databaseExpenseStore } from '@/lib/adapters/expenseAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readExpenseInput } from '@/lib/expenseInput';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import { listExpenses, recordExpense } from '@/services/expenseService';

/**
 * Returns every expense, newest first.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ expenses }`, or an error (401 signed out, 403 not allowed).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewExpenses');
    const expenses = await listExpenses({ expenses: databaseExpenseStore(db) });
    return Response.json({ expenses });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Records a new expense from `{ amountPoisha, expenseDate, category, description, receiptPhoto? }`.
 * @param request - The request.
 * @returns 201 with the saved expense, or an error (400 "Check the expense date" or another bad field, 401, 403).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'recordExpenses');
    const body = await readJsonObject(request);
    const created = await recordExpense(
      { expenses: databaseExpenseStore(db), audit: databaseAuditWriter(db) },
      readExpenseInput(body),
      actor.id,
    );
    return Response.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
