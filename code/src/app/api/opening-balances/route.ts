/**
 * Opening balances (BM-12, CM-02): the list for the manager and the committee (GET), and entering the opening
 * balance of a month, or a corrected figure after a rejection, by the manager (POST). The role check is the first
 * line of each handler.
 *
 * @author Ayesha Siddiqa
 */
import { databaseOpeningBalanceStore } from '@/lib/adapters/fundAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import { enterOpeningBalance, listOpeningBalances } from '@/services/openingBalanceService';

/**
 * Returns every opening balance, newest month first.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ balances }`, or an error (401 signed out, 403 not allowed).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewExpenses');
    const balances = await listOpeningBalances({ balances: databaseOpeningBalanceStore(db) });
    return Response.json({ balances });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Enters an opening balance from `{ month, amountPoisha, note? }`.
 * @param request - The request.
 * @returns 201 with the saved opening balance, or an error (400 "Enter the opening balance." or "Check the month",
 * 401, 403, 409 already waiting or Approved).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'publishFundSummary');
    const body = await readJsonObject(request);
    const saved = await enterOpeningBalance(
      { balances: databaseOpeningBalanceStore(db), audit: databaseAuditWriter(db) },
      {
        month: typeof body.month === 'string' ? body.month.trim() : null,
        amountPoisha: typeof body.amountPoisha === 'number' ? body.amountPoisha : null,
        note: typeof body.note === 'string' ? body.note : null,
      },
      actor.id,
    );
    return Response.json(saved, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
