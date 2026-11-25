/**
 * What the payment services (BB-0604 to BB-0606) need from a payment gateway (RES-01): start a payment and send the
 * resident to its checkout, and ask later how a payment went (the 30-minute re-check, BR-04). Release 1 uses the
 * simulated gateway in `simulatedGateway.ts` (SRS v1.6); a real gateway sandbox would be another implementation
 * of the same interface, so the services don't change.
 *
 * Only the gateway's server-to-server confirmation can make a bill Paid (BR-02); that confirmation arrives at the
 * webhook (BB-0605, BB-0607), not through this interface.
 *
 * @author Mahir Al Kamal
 */
import type { GatewayPaymentState } from '@/models/GatewayTransaction';

/** A payment the app asks the gateway to collect. */
export interface PaymentRequest {
  /** The app's own reference for the payment, sent back with the confirmation. */
  reference: string;
  /** The bill total in poisha; partial payments aren't supported (BR-06). */
  amountPoisha: number;
}

/** A payment the gateway has started. */
export interface StartedPayment {
  /** The gateway's transaction id, which goes on the receipt. */
  transactionId: string;
  /** Where to send the resident to pay. */
  checkoutUrl: string;
}

/** What the gateway reports about a payment. */
export interface GatewayPaymentStatus {
  transactionId: string;
  reference: string;
  amountPoisha: number;
  state: GatewayPaymentState;
  /** The gateway's reason for a failed or cancelled payment, shown on Dues (RES-01 c5). */
  reason: string | null;
}

/** A payment gateway, real or simulated. */
export interface PaymentGateway {
  /**
   * Starts a payment.
   * @param request - The reference and amount.
   * @returns The transaction id and the checkout address.
   * @throws AppError 400 if the reference is empty or the amount isn't a whole number of poisha above 0.
   */
  createPayment(request: PaymentRequest): Promise<StartedPayment>;
  /**
   * How a payment stands now.
   * @param transactionId - The gateway's transaction id.
   * @returns The status.
   * @throws AppError 404 if the gateway has no such transaction.
   */
  getStatus(transactionId: string): Promise<GatewayPaymentStatus>;
}
