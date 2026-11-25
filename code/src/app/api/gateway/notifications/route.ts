/**
 * The payment gateway's webhook (RES-01, BR-02): `POST /api/gateway/notifications`. The gateway calls it server to
 * server when a payment succeeds, fails or is cancelled. It takes no session and no role: the signature over the exact
 * body is the only check (TC-R01-21), and nothing is read before it passes.
 *
 * @author Mahir Al Kamal
 */
import { databasePaymentDeps } from '@/lib/adapters/paymentAdapters';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { gatewaySecret } from '@/lib/gatewaySecret';
import { GATEWAY_SIGNATURE_HEADER } from '@/services/gatewayMessage';
import { receiveGatewayMessage } from '@/services/paymentService';

/**
 * Acts on one gateway message.
 * @param request - The gateway's request: a JSON body and the signature header.
 * @returns 200 with `{ outcome, receiptNumber? }`, or an error (401 bad signature, 400 bad message or amount,
 * 404 unknown payment, 409 the bill kept changing).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const result = await receiveGatewayMessage(
      databasePaymentDeps(db),
      gatewaySecret(),
      { body: await request.text(), signature: request.headers.get(GATEWAY_SIGNATURE_HEADER) },
      new Date(),
    );
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
