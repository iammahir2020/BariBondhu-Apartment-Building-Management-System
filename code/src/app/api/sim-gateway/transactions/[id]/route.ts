/**
 * The simulated gateway's test checkout (RES-01, BB-0608): `GET /api/sim-gateway/transactions/[id]` shows a
 * transaction, and `POST` finishes it with one of the checkout's buttons. Only a signed-in resident can use it, as
 * only a resident starts payments. Demo only: no real money moves (SRS v1.6).
 *
 * @author Mahir Al Kamal
 */
import { databaseCheckoutDeps } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { finishCheckout, readCheckoutChoice } from '@/services/simulatedCheckout';

/** The route's URL segments. */
interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Shows a transaction.
 * @param request - The request; its cookies carry the session.
 * @param context - The transaction id from the URL.
 * @returns 200 with the transaction's status, or an error (401, 403, 404 no such transaction).
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireRole(request, 'payBill');
    const { id } = await context.params;
    const status = await databaseCheckoutDeps(db).gateway.getStatus(id);
    return Response.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Finishes a transaction from `{ choice: 'pay' | 'pay_late' | 'fail' | 'cancel' }`.
 * @param request - The request.
 * @param context - The transaction id from the URL.
 * @returns 200 with `{ status, delivered, deliveryError }`, or an error (400 bad choice, 401, 403, 404, 409 already
 * finished).
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    await requireRole(request, 'payBill');
    const { id } = await context.params;
    const choice = readCheckoutChoice((await readJsonObject(request)).choice);
    const result = await finishCheckout(databaseCheckoutDeps(db), id, choice);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
