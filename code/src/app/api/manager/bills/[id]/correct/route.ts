/**
 * Correct an unpaid bill.
 * BB-0508, BM-03, BR-07, NFR-06.
 *
 * Only an authorised building manager may correct a bill.
 *
 * @author Jannatul Ferdus Nishi
 */

import { databaseBillCorrectionStore } from '@/lib/adapters/billCorrectionAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { correctUnpaidBill } from '@/services/billCorrectionService';

/**
 * Correct the unpaid bill specified by the URL.
 *
 * @param request - Incoming request containing adjustment and reason.
 * @param context - Dynamic bill ID from the URL.
 * @returns Saved correction or a suitable error response.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'manageBills');

    const { id: billId } = await context.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(billId)) {
      throw new AppError('BAD_REQUEST', 'Invalid bill ID');
    }

    const body = await readJsonObject(request);

    if (typeof body.adjustmentPoisha !== 'number') {
      throw new AppError('BAD_REQUEST', 'Enter a valid adjustment amount');
    }

    const reason = typeof body.reason === 'string' ? body.reason : '';

    const correction = await correctUnpaidBill(
      {
        store: databaseBillCorrectionStore(db),
      },
      {
        billId,
        managerId: actor.id,
        adjustmentPoisha: body.adjustmentPoisha,
        reason,
      },
    );

    return Response.json({ correction });
  } catch (error) {
    return toErrorResponse(error);
  }
}
