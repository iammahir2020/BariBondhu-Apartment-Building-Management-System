/**
 * Paying a bill online (RES-01, UC-R06): `POST /api/bills/[id]/payments` starts a payment for one of my
 * household's Unpaid bills and returns where to pay. The bill becomes Payment pending (BR-03).
 *
 * @author Mahir Al Kamal
 */
import { databasePaymentDeps } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { requireBillId } from '@/lib/billInput';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { startBillPayment } from '@/services/paymentService';

/** The route's URL segments. */
interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Starts a payment.
 * @param request - The request; its cookies carry the session.
 * @param context - The bill id from the URL.
 * @returns 201 with `{ paymentId, transactionId, checkoutUrl }`, or an error (401, 403 not mine, 404 no such bill,
 * 409 the bill isn't Unpaid).
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'payBill');
    const billId = requireBillId((await context.params).id);
    const started = await startBillPayment(databasePaymentDeps(db), actor, billId, new Date());
    return Response.json(started, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
