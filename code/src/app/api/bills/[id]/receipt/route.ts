/**
 * The receipt of a Paid bill (RES-01 c3, UC-R08): `GET /api/bills/[id]/receipt`. A resident gets their own
 * household's; the manager any.
 *
 * @author Mahir Al Kamal
 */
import { databaseMyBillStore } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { requireBillId } from '@/lib/billInput';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { getReceipt } from '@/services/myBillsService';

/** The route's URL segments. */
interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Returns the receipt.
 * @param request - The request; its cookies carry the session.
 * @param context - The bill id from the URL.
 * @returns 200 with the receipt, or an error (401, 403 not mine, 404 no such bill, 409 not Paid).
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const viewer = await requireRole(request, 'viewBills');
    const billId = requireBillId((await context.params).id);
    const receipt = await getReceipt(databaseMyBillStore(db), viewer, billId);
    return Response.json(receipt);
  } catch (error) {
    return toErrorResponse(error);
  }
}
