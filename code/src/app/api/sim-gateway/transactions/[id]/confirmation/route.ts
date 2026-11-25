/**
 * Sending a held-back confirmation (RES-01, BB-0608): `POST /api/sim-gateway/transactions/[id]/confirmation`, after
 * "Pay but confirm late" on the test checkout. Demo only (SRS v1.6).
 *
 * @author Mahir Al Kamal
 */
import { databaseCheckoutDeps } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { sendLateConfirmation } from '@/services/simulatedCheckout';

/** The route's URL segments. */
interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Sends the confirmation of a paid transaction now.
 * @param request - The request; its cookies carry the session.
 * @param context - The transaction id from the URL.
 * @returns 200 with `{ status, delivered, deliveryError }`, or an error (401, 403, 404, 409 not paid).
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    await requireRole(request, 'payBill');
    const { id } = await context.params;
    const result = await sendLateConfirmation(databaseCheckoutDeps(db), id);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
