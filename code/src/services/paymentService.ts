/**
 * Paying a bill online (RES-01, UC-R06), with the simulated gateway or any other {@link PaymentGateway}:
 * starting a payment (BB-0604).
 *
 * Only one payment flow runs per bill (BR-03): a payment starts only while the bill is Unpaid, and the bill moves to
 * Payment pending in the same write that saves the payment, so two taps on Pay can't start two payments. The bill
 * states and who may move them come from the bill state machine.
 *
 * @author Mahir Al Kamal
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { Profile } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import { checkBillTransition, type BillStatus } from '@/services/billStateMachine';
import type { PaymentGateway } from '@/services/paymentGateway';

/** Error text, worded as the SRS asks (NFR-25): what went wrong and what to do next. */
export const PAYMENT_ERRORS = {
  notFound: 'This bill does not exist.',
  notYours: "This isn't your household's bill.",
  /** The SRS wording from BM-04, reused for the resident's side of BR-03. */
  inProgress: 'This bill already has a payment in progress',
  paid: 'This bill is already paid.',
  carriedForward: 'This bill was carried forward to your newest bill. Pay that one instead.',
  changed: 'This bill changed while you were paying. Open Dues again.',
} as const;

/** What a payment needs to know about a bill. */
export interface PayableBill {
  id: string;
  /** The household the bill belongs to; empty for a vacant flat's bill (BR-09). */
  occupancyId: string | null;
  status: BillStatus;
  totalPoisha: number;
}

/** A payment to save when it starts. */
export interface StartingPayment {
  id: string;
  billId: string;
  gatewayTransactionId: string;
  amountPoisha: number;
  startedById: string;
  startedAt: Date;
}

/** The bills and payments the payment service reads and changes. */
export interface PaymentStore {
  /** One bill, or null if there is none with this id. */
  findBill(billId: string): Promise<PayableBill | null>;
  /**
   * Saves the payment and moves its bill from Unpaid to Payment pending, in one transaction, only if the bill is still
   * Unpaid.
   * @returns False if the bill was no longer Unpaid, so nothing was saved.
   */
  startIfUnpaid(payment: StartingPayment): Promise<boolean>;
}

/** What the payment service works with. */
export interface PaymentDeps {
  payments: PaymentStore;
  gateway: PaymentGateway;
  audit: AuditWriter;
  /** Makes payment ids; tests pass a fixed one. */
  newId?: () => string;
}

/** A payment the resident can now finish at the gateway. */
export interface StartedBillPayment {
  paymentId: string;
  transactionId: string;
  /** Where to send the resident to pay. */
  checkoutUrl: string;
}

/**
 * Refuses a payment on a bill that isn't Unpaid, with the reason that fits its status (BR-03, TC-R01-04).
 * @param status - The bill's status.
 * @throws AppError 409 unless the bill is Unpaid.
 */
function requireUnpaid(status: BillStatus): void {
  if (status === 'Unpaid') return;
  const message =
    status === 'Paid'
      ? PAYMENT_ERRORS.paid
      : status === 'Carried forward'
        ? PAYMENT_ERRORS.carriedForward
        : PAYMENT_ERRORS.inProgress;
  throw new AppError('CONFLICT', message, { status });
}

/**
 * Starts paying one of my household's bills online: the bill becomes Payment pending, which also blocks a cash
 * claim (BR-03), and the gateway is asked for the bill total (BR-06). Only the gateway's confirmation can then make
 * the bill Paid (BR-02).
 * @param deps - The payment store, the gateway and the audit writer.
 * @param resident - The signed-in household account.
 * @param billId - The bill to pay.
 * @param now - The time the payment starts.
 * @returns The payment and where to send the resident to pay.
 * @throws AppError 404 if there is no such bill.
 * @throws AppError 403 if the bill belongs to another household (TC-R01-20).
 * @throws AppError 409 if the bill isn't Unpaid, or stopped being Unpaid while the payment started (TC-R01-04).
 */
export async function startBillPayment(
  deps: PaymentDeps,
  resident: Profile,
  billId: string,
  now: Date,
): Promise<StartedBillPayment> {
  const bill = await deps.payments.findBill(billId);
  if (!bill) throw new AppError('NOT_FOUND', PAYMENT_ERRORS.notFound);
  if (bill.occupancyId === null || bill.occupancyId !== resident.occupancyId) {
    throw new AppError('FORBIDDEN', PAYMENT_ERRORS.notYours);
  }
  requireUnpaid(bill.status);
  checkBillTransition('Unpaid', 'Payment pending', 'resident', 'start_online_payment');

  const paymentId = (deps.newId ?? randomUUID)();
  const started = await deps.gateway.createPayment({
    reference: paymentId,
    amountPoisha: bill.totalPoisha,
  });
  const saved = await deps.payments.startIfUnpaid({
    id: paymentId,
    billId: bill.id,
    gatewayTransactionId: started.transactionId,
    amountPoisha: bill.totalPoisha,
    startedById: resident.id,
    startedAt: now,
  });
  if (!saved) throw new AppError('CONFLICT', PAYMENT_ERRORS.changed);

  await deps.audit({
    actorId: resident.id,
    action: 'bill.start_payment',
    entityType: 'bills',
    entityId: bill.id,
    oldValues: { status: 'Unpaid' },
    newValues: {
      status: 'Payment pending',
      paymentId,
      gatewayTransactionId: started.transactionId,
      amountPoisha: bill.totalPoisha,
    },
  });
  return { paymentId, transactionId: started.transactionId, checkoutUrl: started.checkoutUrl };
}
