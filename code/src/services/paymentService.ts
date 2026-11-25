/**
 * Paying a bill online (RES-01, UC-R06), with the simulated gateway or any other {@link PaymentGateway}:
 * starting a payment (BB-0604), acting on what the gateway reports (BB-0605) and the 30-minute re-check of payments
 * that never got an answer (BB-0606).
 *
 * Only one payment flow runs per bill (BR-03): a payment starts only while the bill is Unpaid, and the bill moves to
 * Payment pending in the same write that saves the payment, so two taps on Pay can't start two payments. The bill
 * states and who may move them come from the bill state machine.
 *
 * Only the gateway's signed server-to-server message can make a bill Paid (BR-02); what the resident's phone reports
 * changes nothing. A confirmation makes the bill Paid with a receipt while it is Unpaid or Payment pending; if the
 * bill was by then settled another way, the money is flagged to the manager as an overpayment (BR-04).
 *
 * @author Mahir Al Kamal
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { Payment, Profile } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import { checkBillTransition, type BillStatus } from '@/services/billStateMachine';
import {
  GATEWAY_MESSAGE_ERRORS,
  isValidGatewaySignature,
  parseGatewayMessage,
} from '@/services/gatewayMessage';
import type { GatewayPaymentStatus, PaymentGateway } from '@/services/paymentGateway';

/** Error text, worded as the SRS asks (NFR-25): what went wrong and what to do next. */
export const PAYMENT_ERRORS = {
  notFound: 'This bill does not exist.',
  notYours: "This isn't your household's bill.",
  /** The SRS wording from BM-04, reused for the resident's side of BR-03. */
  inProgress: 'This bill already has a payment in progress',
  paid: 'This bill is already paid.',
  carriedForward: 'This bill was carried forward to your newest bill. Pay that one instead.',
  changed: 'This bill changed while you were paying. Open Dues again.',
  /** For the gateway, not the resident: a payment the app never started. */
  unknownPayment: 'The app has no payment with this transaction id.',
  /** The amount paid isn't the amount asked for (BR-06). */
  amount: 'The amount paid does not match the bill total.',
} as const;

/** Why a payment ended without money, when the gateway gives no reason of its own (RES-01 c5). */
export const PAYMENT_END_REASONS = {
  failed: 'The payment did not go through. You can pay again.',
  timedOut: 'No payment arrived within 30 minutes. You can pay again.',
} as const;

/** How long a payment may stay Payment pending before the app asks the gateway (BR-04). */
export const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

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
  /** The payment with this gateway transaction id, or null if the app never started one. */
  findPaymentByTransaction(transactionId: string): Promise<Payment | null>;
  /**
   * In one transaction, and only if the bill's status is still `from`: the bill becomes Paid, the payment is marked
   * confirmed (clearing any end time and reason, for a late confirmation) and the receipt is saved.
   * @returns The new receipt's number, or null if the bill's status had changed, so nothing was saved.
   */
  payIfStatus(change: ConfirmedPayment & { from: BillStatus }): Promise<number | null>;
  /** In one transaction: the payment is marked confirmed and an overpayment is flagged for it. The bill is left alone. */
  flagOverpayment(change: ConfirmedPayment): Promise<void>;
  /**
   * In one transaction, and only while the payment is neither confirmed nor ended: the payment ends with the reason,
   * and its bill goes back from Payment pending to Unpaid if it is still Payment pending.
   * @returns False if the payment had already been confirmed or ended, so nothing changed.
   */
  endIfOpen(change: EndedPayment): Promise<boolean>;
  /** Payments neither confirmed nor ended that started at or before the cutoff. */
  openPaymentsStartedBy(cutoff: Date): Promise<Payment[]>;
}

/** A payment the gateway confirmed. */
export interface ConfirmedPayment {
  paymentId: string;
  billId: string;
  amountPoisha: number;
  at: Date;
}

/** A payment that ended without money. */
export interface EndedPayment {
  paymentId: string;
  billId: string;
  reason: string;
  at: Date;
}

/**
 * What the app did with a gateway report: the bill became Paid, the money became an overpayment, the payment ended
 * and the bill is Unpaid again, the report repeated one already acted on, or the payment isn't finished yet.
 */
export type GatewayOutcome = 'paid' | 'overpayment' | 'ended' | 'repeat' | 'pending';

/** The result of acting on a gateway report. */
export interface GatewayResult {
  outcome: GatewayOutcome;
  /** The receipt number when the bill became Paid. */
  receiptNumber?: number;
}

/** A message as it reached the webhook. */
export interface GatewayMessage {
  /** The exact body, which the signature covers. */
  body: string;
  /** The signature header, or null if there was none. */
  signature: string | null;
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

/** Bills a confirmation can still make Paid (BR-04). */
const PAYABLE_ON_CONFIRMATION: readonly BillStatus[] = ['Unpaid', 'Payment pending'];

/**
 * Records money the gateway confirmed. While the bill is Unpaid or Payment pending and still costs what was paid,
 * the bill becomes Paid with a receipt (BR-02, TC-R01-05, TC-R01-07). Otherwise the bill doesn't change and the
 * money is flagged to the manager as an overpayment (BR-04, TC-R01-09); that includes an Unpaid bill whose total was
 * corrected after this payment started, since a bill is never Paid by a different amount (BR-06).
 */
async function confirmPayment(
  deps: PaymentDeps,
  payment: Payment,
  at: Date,
): Promise<GatewayResult> {
  if (payment.confirmedAt !== null) return { outcome: 'repeat' };
  const change: ConfirmedPayment = {
    paymentId: payment.id,
    billId: payment.billId,
    amountPoisha: payment.amountPoisha,
    at,
  };

  // The bill can change between reading it and the conditional write; read it again once if it did.
  for (let attempt = 0; attempt < 2; attempt++) {
    const bill = await deps.payments.findBill(payment.billId);
    if (!bill) throw new AppError('NOT_FOUND', PAYMENT_ERRORS.notFound);

    if (
      !PAYABLE_ON_CONFIRMATION.includes(bill.status) ||
      bill.totalPoisha !== payment.amountPoisha
    ) {
      await deps.payments.flagOverpayment(change);
      await deps.audit({
        actorId: null,
        action: 'bill.overpayment',
        entityType: 'bills',
        entityId: bill.id,
        oldValues: { status: bill.status },
        newValues: {
          status: bill.status,
          paymentId: payment.id,
          gatewayTransactionId: payment.gatewayTransactionId,
          amountPoisha: payment.amountPoisha,
        },
      });
      return { outcome: 'overpayment' };
    }

    checkBillTransition(bill.status, 'Paid', 'gateway', 'confirm_online_payment');
    const receiptNumber = await deps.payments.payIfStatus({ ...change, from: bill.status });
    if (receiptNumber !== null) {
      await deps.audit({
        actorId: null,
        action: 'bill.confirm_payment',
        entityType: 'bills',
        entityId: bill.id,
        oldValues: { status: bill.status },
        newValues: {
          status: 'Paid',
          paymentId: payment.id,
          gatewayTransactionId: payment.gatewayTransactionId,
          receiptNumber,
        },
      });
      return { outcome: 'paid', receiptNumber };
    }
  }
  throw new AppError('CONFLICT', PAYMENT_ERRORS.changed);
}

/**
 * Ends a payment that failed, was cancelled or timed out: the bill goes back to Unpaid, so the resident can pay
 * again, and the reason is kept for Dues (RES-01 c5, TC-R01-17). Ending it again changes nothing.
 */
async function endPayment(
  deps: PaymentDeps,
  payment: Payment,
  reason: string,
  at: Date,
): Promise<GatewayResult> {
  checkBillTransition('Payment pending', 'Unpaid', 'system', 'fail_online_payment');
  const ended = await deps.payments.endIfOpen({
    paymentId: payment.id,
    billId: payment.billId,
    reason,
    at,
  });
  if (!ended) return { outcome: 'repeat' };
  await deps.audit({
    actorId: null,
    action: 'bill.end_payment',
    entityType: 'bills',
    entityId: payment.billId,
    oldValues: { status: 'Payment pending' },
    newValues: {
      status: 'Unpaid',
      paymentId: payment.id,
      gatewayTransactionId: payment.gatewayTransactionId,
      reason,
    },
  });
  return { outcome: 'ended' };
}

/**
 * Acts on what the gateway reports about one of the app's payments, whether it came in the webhook or from a
 * re-check: Succeeded confirms it, Failed or Cancelled ends it, Pending changes nothing.
 * @throws AppError 400 if the report is for a different payment or a different amount (BR-06, TC-R01-11).
 */
async function applyGatewayStatus(
  deps: PaymentDeps,
  payment: Payment,
  status: GatewayPaymentStatus,
  at: Date,
): Promise<GatewayResult> {
  if (status.reference !== payment.id) {
    throw new AppError('BAD_REQUEST', GATEWAY_MESSAGE_ERRORS.body);
  }
  if (status.amountPoisha !== payment.amountPoisha) {
    throw new AppError('BAD_REQUEST', PAYMENT_ERRORS.amount, {
      expected: payment.amountPoisha,
      received: status.amountPoisha,
    });
  }
  switch (status.state) {
    case 'Succeeded':
      return confirmPayment(deps, payment, at);
    case 'Failed':
    case 'Cancelled':
      return endPayment(deps, payment, status.reason ?? PAYMENT_END_REASONS.failed, at);
    case 'Pending':
      return { outcome: 'pending' };
  }
}

/**
 * The gateway's server-to-server message about a payment (BB-0605). Nothing is read before the signature checks out,
 * and the same message twice changes nothing the second time (TC-R01-08).
 * @param deps - The payment store, the gateway and the audit writer.
 * @param secret - The shared gateway secret.
 * @param message - The body and signature as received.
 * @param now - When it arrived.
 * @returns What the app did with it.
 * @throws AppError 401 if the signature is missing or wrong (TC-R01-10).
 * @throws AppError 400 if the body isn't a valid message, or reports a different payment or amount (TC-R01-11).
 * @throws AppError 404 if the app never started a payment with this transaction id.
 */
export async function receiveGatewayMessage(
  deps: PaymentDeps,
  secret: string,
  message: GatewayMessage,
  now: Date,
): Promise<GatewayResult> {
  if (!isValidGatewaySignature(message.body, message.signature, secret)) {
    throw new AppError('UNAUTHORIZED', GATEWAY_MESSAGE_ERRORS.signature);
  }
  const status = parseGatewayMessage(message.body);
  const payment = await deps.payments.findPaymentByTransaction(status.transactionId);
  if (!payment) throw new AppError('NOT_FOUND', PAYMENT_ERRORS.unknownPayment);
  return applyGatewayStatus(deps, payment, status, now);
}

/** What the re-check did with one payment; `skipped` means it stays Payment pending and is checked next time. */
export interface RecheckedPayment {
  paymentId: string;
  outcome: GatewayOutcome | 'skipped';
}

/**
 * The re-check (BB-0606, BR-04): for every payment Payment pending for 30 minutes or more, asks the gateway how it
 * went. A success makes the bill Paid with a receipt, or an overpayment if the bill was settled meanwhile
 * (TC-R01-15). A failure or cancellation ends it with the gateway's reason (TC-R01-17). No answer yet means no
 * successful payment, so it ends as timed out and the bill is Unpaid again (TC-R01-14). If the gateway can't be
 * reached, or its answer can't be used, the payment is left as it is and checked again next time; it never becomes
 * Paid without a confirmation (TC-R01-16).
 * @param deps - The payment store, the gateway and the audit writer.
 * @param now - The time of the re-check.
 * @returns What happened to each payment checked.
 */
export async function recheckPendingPayments(
  deps: PaymentDeps,
  now: Date,
): Promise<RecheckedPayment[]> {
  const due = await deps.payments.openPaymentsStartedBy(
    new Date(now.getTime() - PAYMENT_TIMEOUT_MS),
  );
  const results: RecheckedPayment[] = [];
  for (const payment of due) {
    let outcome: RecheckedPayment['outcome'];
    try {
      const status = await deps.gateway.getStatus(payment.gatewayTransactionId);
      outcome =
        status.state === 'Pending'
          ? (await endPayment(deps, payment, PAYMENT_END_REASONS.timedOut, now)).outcome
          : (await applyGatewayStatus(deps, payment, status, now)).outcome;
    } catch {
      outcome = 'skipped';
    }
    results.push({ paymentId: payment.id, outcome });
  }
  return results;
}
