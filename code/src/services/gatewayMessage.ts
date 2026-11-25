/**
 * The gateway's server-to-server message about a payment (RES-01, BR-02): its JSON body, and the signature that
 * proves the gateway sent it. The signature is an HMAC-SHA256 of the exact body with a secret only the gateway and
 * the app know, sent as hex in the {@link GATEWAY_SIGNATURE_HEADER} header. The simulated gateway signs its messages
 * the same way a real sandbox would.
 *
 * @author Mahir Al Kamal
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { GATEWAY_PAYMENT_STATES, type GatewayPaymentState } from '@/models/GatewayTransaction';
import type { GatewayPaymentStatus } from '@/services/paymentGateway';

/** The request header that carries the signature. */
export const GATEWAY_SIGNATURE_HEADER = 'x-gateway-signature';

/** Error text for a message the app can't use. */
export const GATEWAY_MESSAGE_ERRORS = {
  signature: 'The gateway message is not signed correctly.',
  body: 'The gateway message is not valid.',
} as const;

/**
 * Signs a message body.
 * @param body - The exact body that will be sent.
 * @param secret - The shared gateway secret.
 * @returns The signature as 64 hexadecimal characters.
 * @throws Error if the secret is empty, so a missing setting can't produce a signature anyone could make.
 */
export function signGatewayMessage(body: string, secret: string): string {
  if (secret === '') throw new Error('The gateway secret is not set.');
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Whether a message really comes from the gateway: its signature matches the body, compared in constant time.
 * @param body - The exact body received.
 * @param signature - The signature header, or null if there was none.
 * @param secret - The shared gateway secret.
 * @returns False for a missing, malformed or wrong signature, or an empty secret.
 */
export function isValidGatewaySignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (secret === '' || signature === null || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signGatewayMessage(body, secret), 'hex');
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

function isState(value: unknown): value is GatewayPaymentState {
  return typeof value === 'string' && (GATEWAY_PAYMENT_STATES as readonly string[]).includes(value);
}

/**
 * Reads a message body the signature has already been checked for.
 * @param body - The JSON body.
 * @returns The payment status it reports.
 * @throws AppError 400 if it isn't JSON with a transaction id, a reference, a whole amount, a known state and a
 * reason that is text or null.
 */
export function parseGatewayMessage(body: string): GatewayPaymentStatus {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new AppError('BAD_REQUEST', GATEWAY_MESSAGE_ERRORS.body);
  }
  if (typeof value !== 'object' || value === null) {
    throw new AppError('BAD_REQUEST', GATEWAY_MESSAGE_ERRORS.body);
  }
  const { transactionId, reference, amountPoisha, state, reason } = value as Record<
    string,
    unknown
  >;
  if (
    typeof transactionId !== 'string' ||
    transactionId === '' ||
    typeof reference !== 'string' ||
    typeof amountPoisha !== 'number' ||
    !Number.isInteger(amountPoisha) ||
    !isState(state) ||
    (reason !== null && typeof reason !== 'string')
  ) {
    throw new AppError('BAD_REQUEST', GATEWAY_MESSAGE_ERRORS.body);
  }
  return { transactionId, reference, amountPoisha, state, reason };
}
