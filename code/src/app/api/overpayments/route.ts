/**
 * Overpayments for the manager (BM-04, BR-04, BB-0613): every overpayment, Flagged ones first. Manager only
 * (`decidePaymentClaims`). The role check is the first line.
 *
 * @author Mahir Al Kamal
 */
import { databaseOverpaymentStore } from '@/lib/adapters/overpaymentAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { listOverpayments } from '@/services/overpaymentService';

/**
 * Returns every overpayment.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ overpayments }`, or an error (401 signed out, 403 not the manager).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'decidePaymentClaims');
    const overpayments = await listOverpayments(databaseOverpaymentStore(db));
    return Response.json({ overpayments });
  } catch (error) {
    return toErrorResponse(error);
  }
}
