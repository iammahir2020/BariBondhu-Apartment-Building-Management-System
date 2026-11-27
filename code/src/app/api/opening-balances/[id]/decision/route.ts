/**
 * The committee's decision on an opening balance (CM-02): approve it, or reject it with a reason. The role check is
 * the first line of the handler.
 *
 * @author Ayesha Siddiqa
 */
import { databaseOpeningBalanceStore } from '@/lib/adapters/fundAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import { approveOpeningBalance, rejectOpeningBalance } from '@/services/openingBalanceService';

/** What Next passes to a route with `[id]` in its address. */
interface BalanceDecisionContext {
  params: Promise<{ id: string }>;
}

/**
 * Decides an opening balance. The body is `{ decision: 'approve' }` or `{ decision: 'reject', reason }`.
 * @param request - The request.
 * @param context - Holds the opening balance id from the address.
 * @returns 200 with the decided opening balance, or an error (400 "Write a reason", 401, 403, 404, 409 already decided).
 */
export async function POST(request: Request, context: BalanceDecisionContext): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'decideExpenses');
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const deps = { balances: databaseOpeningBalanceStore(db), audit: databaseAuditWriter(db) };

    if (body.decision === 'approve') {
      return Response.json(await approveOpeningBalance(deps, id, actor.id));
    }
    if (body.decision === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason : null;
      return Response.json(await rejectOpeningBalance(deps, id, reason, actor.id));
    }
    throw new AppError('BAD_REQUEST', 'Choose approve or reject.');
  } catch (error) {
    return toErrorResponse(error);
  }
}
