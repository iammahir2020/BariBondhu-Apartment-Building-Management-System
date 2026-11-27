/**
 * The simulated gateway's test checkout (RES-01, BB-0608, SRS v1.6): what its four buttons do. Pay, Fail and
 * Cancel finish the transaction and send the app the gateway's signed server-to-server message at once. "Pay but
 * confirm late" pays it and holds the message back, so the demo can show a confirmation that arrives after the
 * 30-minute re-check or after the bill was settled another way (BR-04, TC-R01-07, TC-R01-09); the checkout then
 * offers to send it.
 *
 * The message is signed with the same secret as a real sandbox's would be, and goes through the same code as the
 * webhook, so the signature check is exercised too.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { signGatewayMessage } from '@/services/gatewayMessage';
import type { GatewayPaymentStatus } from '@/services/paymentGateway';
import type { GatewayMessage } from '@/services/paymentService';
import type { SimulatedGateway, SimulatedOutcome } from '@/services/simulatedGateway';

/** The checkout's buttons. */
export const CHECKOUT_CHOICES = ['pay', 'pay_late', 'fail', 'cancel'] as const;

/** One of the checkout's buttons. */
export type CheckoutChoice = (typeof CHECKOUT_CHOICES)[number];

/** How each button finishes the transaction. */
export const CHECKOUT_OUTCOMES: Readonly<Record<CheckoutChoice, SimulatedOutcome>> = {
  pay: 'Succeeded',
  pay_late: 'Succeeded',
  fail: 'Failed',
  cancel: 'Cancelled',
};

/** Error text of the checkout. */
export const CHECKOUT_ERRORS = {
  choice: 'Choose Pay, Pay but confirm late, Fail or Cancel.',
  notPaid: 'Only a paid payment has a confirmation to send.',
} as const;

/** What the checkout works with. */
export interface CheckoutDeps {
  gateway: SimulatedGateway;
  /** The shared gateway secret the message is signed with. */
  secret: string;
  /** Hands a signed message to the app, as the gateway's server-to-server call would. */
  deliver: (message: GatewayMessage) => Promise<unknown>;
}

/** What the checkout shows after a button. */
export interface CheckoutResult {
  status: GatewayPaymentStatus;
  /** Whether the app took the message. False when it was held back, or the app refused it. */
  delivered: boolean;
  /** Why the app refused the message, if it did. */
  deliveryError: string | null;
}

/**
 * Reads a button from a request body.
 * @param value - The `choice` field.
 * @returns The button.
 * @throws AppError 400 if it isn't one of the four.
 */
export function readCheckoutChoice(value: unknown): CheckoutChoice {
  if (typeof value === 'string' && (CHECKOUT_CHOICES as readonly string[]).includes(value)) {
    return value as CheckoutChoice;
  }
  throw new AppError('BAD_REQUEST', CHECKOUT_ERRORS.choice);
}

/**
 * The gateway's message about a transaction, signed.
 * @param status - The transaction's status.
 * @param secret - The shared gateway secret.
 * @returns The body and its signature.
 */
export function signedGatewayMessage(status: GatewayPaymentStatus, secret: string): GatewayMessage {
  const body = JSON.stringify(status);
  return { body, signature: signGatewayMessage(body, secret) };
}

async function send(deps: CheckoutDeps, status: GatewayPaymentStatus): Promise<CheckoutResult> {
  try {
    await deps.deliver(signedGatewayMessage(status, deps.secret));
    return { status, delivered: true, deliveryError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status, delivered: false, deliveryError: message };
  }
}

/**
 * One of the checkout's buttons: finishes the transaction, then sends the app the message, unless it is
 * "Pay but confirm late". A message the app refuses doesn't undo the gateway's side, as with a real gateway; the
 * 30-minute re-check picks the payment up later.
 * @param deps - The gateway, the secret and how to reach the app.
 * @param transactionId - The transaction.
 * @param choice - The button.
 * @returns The transaction's status and whether the app took the message.
 * @throws AppError 404 if there is no such transaction.
 * @throws AppError 409 if it was already finished.
 */
export async function finishCheckout(
  deps: CheckoutDeps,
  transactionId: string,
  choice: CheckoutChoice,
): Promise<CheckoutResult> {
  const status = await deps.gateway.decide(transactionId, CHECKOUT_OUTCOMES[choice]);
  if (choice === 'pay_late') return { status, delivered: false, deliveryError: null };
  return send(deps, status);
}

/**
 * Sends the held-back confirmation of a paid transaction now (after "Pay but confirm late"). Sending it again is
 * harmless: the app acts on a confirmation once (TC-R01-08).
 * @param deps - The gateway, the secret and how to reach the app.
 * @param transactionId - The transaction.
 * @returns The transaction's status and whether the app took the message.
 * @throws AppError 404 if there is no such transaction.
 * @throws AppError 409 if the transaction wasn't paid.
 */
export async function sendLateConfirmation(
  deps: CheckoutDeps,
  transactionId: string,
): Promise<CheckoutResult> {
  const status = await deps.gateway.getStatus(transactionId);
  if (status.state !== 'Succeeded') {
    throw new AppError('CONFLICT', CHECKOUT_ERRORS.notPaid, { state: status.state });
  }
  return send(deps, status);
}
