/**
 * Marks an overpayment Refunded once the manager has returned the money outside the app (BM-04, BR-04, BB-0613).
 * Manager only (`decidePaymentClaims`). The role check is the first line.
 *
 * @author Mahir Al Kamal
 */
import { databaseOverpaymentStore } from '@/lib/adapters/overpaymentAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { databaseAuditWriter } from '@/services/auditService';
import { OVERPAYMENT_ERRORS, refundOverpayment } from '@/services/overpaymentService';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks the overpayment in the URL Refunded.
 * @param request - The request.
 * @param context - The route's `[id]`.
 * @returns 204, or an error (401, 403 not the manager, 404 no such overpayment, 409 already Refunded).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'decidePaymentClaims');
    const { id } = await context.params;
    if (!UUID.test(id)) throw new AppError('NOT_FOUND', OVERPAYMENT_ERRORS.notFound);
    await refundOverpayment(
      { overpayments: databaseOverpaymentStore(db), audit: databaseAuditWriter(db) },
      id,
      actor,
      new Date(),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
