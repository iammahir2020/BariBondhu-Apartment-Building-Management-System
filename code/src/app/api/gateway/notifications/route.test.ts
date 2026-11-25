/**
 * Tests for the gateway webhook `POST /api/gateway/notifications` (RES-01, BR-02): no session or role check, the
 * exact body and signature header reach the service with the configured secret, and its answers pass through.
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { GATEWAY_MESSAGE_ERRORS, GATEWAY_SIGNATURE_HEADER } from '@/services/gatewayMessage';
import { receiveGatewayMessage } from '@/services/paymentService';
import { POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/gatewaySecret', () => ({ gatewaySecret: () => 'configured-secret' }));
jest.mock('@/lib/adapters/paymentAdapters', () => ({ databasePaymentDeps: jest.fn(() => ({})) }));
jest.mock('@/services/paymentService', () => ({ receiveGatewayMessage: jest.fn() }));

const BODY =
  '{"transactionId":"SIM-1","reference":"payment-1","amountPoisha":350000,"state":"Succeeded","reason":null}';

function send(signature?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set(GATEWAY_SIGNATURE_HEADER, signature);
  return POST(
    new Request('http://localhost/api/gateway/notifications', {
      method: 'POST',
      body: BODY,
      headers,
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/gateway/notifications', () => {
  it('passes the exact body, the signature and the secret on, with no role check (TC-R01-21)', async () => {
    jest.mocked(receiveGatewayMessage).mockResolvedValue({ outcome: 'paid', receiptNumber: 101 });

    const response = await send('ab'.repeat(32));

    expect(requireRole).not.toHaveBeenCalled();
    expect(receiveGatewayMessage).toHaveBeenCalledWith(
      {},
      'configured-secret',
      { body: BODY, signature: 'ab'.repeat(32) },
      expect.any(Date),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: 'paid', receiptNumber: 101 });
  });

  it('passes a missing signature on as null, and answers the refusal with 401 (TC-R01-10)', async () => {
    jest
      .mocked(receiveGatewayMessage)
      .mockRejectedValue(new AppError('UNAUTHORIZED', GATEWAY_MESSAGE_ERRORS.signature));

    const response = await send();

    expect(jest.mocked(receiveGatewayMessage).mock.calls[0]?.[2]).toEqual({
      body: BODY,
      signature: null,
    });
    expect(response.status).toBe(401);
  });
});
