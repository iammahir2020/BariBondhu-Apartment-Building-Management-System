/**
 * The monthly fund summary (BM-12, RES-05): the published summaries for the manager, the committee and residents
 * (GET), and publishing a month by the manager (POST). The role check is the first line of each handler. Only
 * totals are returned, never which flats owe money (NFR-12).
 *
 * @author Ayesha Siddiqa
 */
import {
  databaseFundFigureStore,
  databaseFundSummaryStore,
  databaseOpeningBalanceStore,
} from '@/lib/adapters/fundAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import { listPublishedSummaries, publishFundSummary } from '@/services/fundPublishService';

/**
 * Returns the published summaries, newest month first. A Draft is never returned (RES-05 c3).
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ summaries }`, or an error (401 signed out, 403 not allowed).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewFundSummary');
    const summaries = await listPublishedSummaries({ summaries: databaseFundSummaryStore(db) });
    return Response.json({ summaries });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Publishes the summary of a month from `{ month }` (the first day, like 2026-10-01).
 * @param request - The request.
 * @returns 201 with the published summary, or an error (400 "You can publish once the month has ended", 401, 403,
 * 409 already published or the opening balance is not approved).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'publishFundSummary');
    const body = await readJsonObject(request);
    const month = typeof body.month === 'string' ? body.month.trim() : '';
    const saved = await publishFundSummary(
      {
        figures: databaseFundFigureStore(db),
        balances: databaseOpeningBalanceStore(db),
        summaries: databaseFundSummaryStore(db),
        audit: databaseAuditWriter(db),
      },
      month,
      actor.id,
    );
    return Response.json(saved, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
