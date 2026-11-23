/**
 * One expense (BM-08): the manager edits it while it waits, resubmits it after a rejection, or adds a correcting
 * expense to an Approved one. The role check is the first line of the handler.
 *
 * @author Ayesha Siddiqa
 */
import { databaseExpenseStore } from '@/lib/adapters/expenseAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readExpenseInput } from '@/lib/expenseInput';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import { addCorrectingExpense, editExpense, resubmitExpense } from '@/services/expenseService';

/** What Next passes to a route with `[id]` in its address. */
interface ExpenseRouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Changes one expense. The body is `{ action, ...expense fields }`: `edit` (also needs `note`), `resubmit` or
 * `correct` (adds a correcting expense linked to this Approved one).
 * @param request - The request.
 * @param context - Holds the expense id from the address.
 * @returns 200 with the changed expense (201 for `correct`), or an error (400, 401, 403, 404, 409).
 */
export async function PATCH(request: Request, context: ExpenseRouteContext): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'recordExpenses');
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const input = readExpenseInput(body);
    const deps = { expenses: databaseExpenseStore(db), audit: databaseAuditWriter(db) };

    if (body.action === 'edit') {
      const note = typeof body.note === 'string' ? body.note : null;
      return Response.json(await editExpense(deps, id, input, note, actor.id));
    }
    if (body.action === 'resubmit') {
      return Response.json(await resubmitExpense(deps, id, input, actor.id));
    }
    if (body.action === 'correct') {
      const created = await addCorrectingExpense(deps, id, input, actor.id);
      return Response.json(created, { status: 201 });
    }
    throw new AppError('BAD_REQUEST', 'Choose edit, resubmit or correct.');
  } catch (error) {
    return toErrorResponse(error);
  }
}
