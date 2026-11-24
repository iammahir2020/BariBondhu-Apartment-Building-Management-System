/**
 * My household's bills for Dues (RES-01): `GET /api/bills/mine`. Before reading them, payments that have been
 * Payment pending for 30 minutes are re-checked with the gateway (BR-04), so Dues never shows a stuck payment. The
 * re-check covers the whole building's due payments and never stops the list from loading.
 *
 * @author Mahir Al Kamal
 */
import { databaseMyBillStore, databasePaymentDeps } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { listMyBills } from '@/services/myBillsService';
import { recheckPendingPayments } from '@/services/paymentService';

/**
 * Returns my household's bills, newest month first.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ bills }`, or an error (401 signed out, 403 not a household account).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'viewBills');
    try {
      await recheckPendingPayments(databasePaymentDeps(db), new Date());
    } catch (error) {
      console.error('Payment re-check failed', error);
    }
    const bills = await listMyBills(databaseMyBillStore(db), actor);
    return Response.json({ bills });
  } catch (error) {
    return toErrorResponse(error);
  }
}
