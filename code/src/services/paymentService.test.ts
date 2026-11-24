/**
 * Tests for paying a bill online (RES-01): starting a payment (BB-0604) and the gateway's confirmation (BB-0605).
 * The store and the gateway are in memory.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { Payment } from '@/models';
import type { BillStatus } from '@/services/billStateMachine';
import { GATEWAY_MESSAGE_ERRORS, signGatewayMessage } from '@/services/gatewayMessage';
import type {
  GatewayPaymentStatus,
  PaymentGateway,
  PaymentRequest,
} from '@/services/paymentGateway';
import {
  PAYMENT_END_REASONS,
  PAYMENT_ERRORS,
  receiveGatewayMessage,
  startBillPayment,
  type ConfirmedPayment,
  type EndedPayment,
  type PayableBill,
  type PaymentDeps,
  type PaymentStore,
  type StartingPayment,
} from '@/services/paymentService';
import { makeProfile, memoryAudit } from '@/services/testFakes';

const NOW = new Date('2026-11-25T10:00:00+06:00');
const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });

/** A receipt, as the in-memory store keeps it. */
interface StoredReceipt {
  number: number;
  billId: string;
  paymentId: string;
  amountPoisha: number;
  paidAt: Date;
}

/** An in-memory bill and payment store. */
class MemoryPaymentStore implements PaymentStore {
  readonly bills = new Map<string, PayableBill>();
  readonly payments: Payment[] = [];
  readonly receipts: StoredReceipt[] = [];
  readonly overpayments: { billId: string; paymentId: string; amountPoisha: number }[] = [];
  /** Statuses another tab moves the bill to, one just before each of the next conditional writes. */
  private racing: BillStatus[] = [];

  /** Makes the next conditional writes find the bill already moved to these statuses, in order. */
  race(...statuses: BillStatus[]): void {
    this.racing = statuses;
  }

  private applyRace(bill: PayableBill | undefined): void {
    const next = this.racing.shift();
    if (bill && next) bill.status = next;
  }

  private payment(id: string): Payment {
    const payment = this.payments.find((row) => row.id === id);
    if (!payment) throw new Error(`no payment ${id}`);
    return payment;
  }

  addBill(overrides: Partial<PayableBill> = {}): PayableBill {
    const bill: PayableBill = {
      id: `bill-${this.bills.size + 1}`,
      occupancyId: 'occ-1',
      status: 'Unpaid',
      totalPoisha: 350_000,
      ...overrides,
    };
    this.bills.set(bill.id, bill);
    return bill;
  }

  async findBill(billId: string): Promise<PayableBill | null> {
    const bill = this.bills.get(billId);
    return bill ? { ...bill } : null;
  }

  async startIfUnpaid(payment: StartingPayment): Promise<boolean> {
    const bill = this.bills.get(payment.billId);
    this.applyRace(bill);
    if (bill?.status !== 'Unpaid') return false;
    bill.status = 'Payment pending';
    this.payments.push({ ...payment, confirmedAt: null, endedAt: null, endReason: null });
    return true;
  }

  /** Adds a payment that was started earlier, without the start flow. */
  addPayment(overrides: Partial<Payment> & { billId: string }): Payment {
    const n = this.payments.length + 1;
    const payment: Payment = {
      id: `payment-${n}`,
      gatewayTransactionId: `SIM-${n}`,
      amountPoisha: 350_000,
      startedById: 'resident-1',
      startedAt: new Date('2026-11-25T09:00:00+06:00'),
      confirmedAt: null,
      endedAt: null,
      endReason: null,
      ...overrides,
    };
    this.payments.push(payment);
    return { ...payment };
  }

  async findPaymentByTransaction(transactionId: string): Promise<Payment | null> {
    const payment = this.payments.find((row) => row.gatewayTransactionId === transactionId);
    return payment ? { ...payment } : null;
  }

  async payIfStatus(change: ConfirmedPayment & { from: BillStatus }): Promise<number | null> {
    const bill = this.bills.get(change.billId);
    this.applyRace(bill);
    if (bill?.status !== change.from) return null;
    bill.status = 'Paid';
    Object.assign(this.payment(change.paymentId), {
      confirmedAt: change.at,
      endedAt: null,
      endReason: null,
    });
    const number = this.receipts.length + 101;
    this.receipts.push({
      number,
      billId: change.billId,
      paymentId: change.paymentId,
      amountPoisha: change.amountPoisha,
      paidAt: change.at,
    });
    return number;
  }

  async flagOverpayment(change: ConfirmedPayment): Promise<void> {
    Object.assign(this.payment(change.paymentId), {
      confirmedAt: change.at,
      endedAt: null,
      endReason: null,
    });
    this.overpayments.push({
      billId: change.billId,
      paymentId: change.paymentId,
      amountPoisha: change.amountPoisha,
    });
  }

  async endIfOpen(change: EndedPayment): Promise<boolean> {
    const payment = this.payment(change.paymentId);
    if (payment.confirmedAt !== null || payment.endedAt !== null) return false;
    payment.endedAt = change.at;
    payment.endReason = change.reason;
    const bill = this.bills.get(change.billId);
    if (bill?.status === 'Payment pending') bill.status = 'Unpaid';
    return true;
  }
}

/** A gateway that hands out numbered transactions and reports what tests set. */
class FakeGateway implements PaymentGateway {
  readonly requests: PaymentRequest[] = [];
  readonly statuses = new Map<string, GatewayPaymentStatus>();

  async createPayment(request: PaymentRequest) {
    this.requests.push(request);
    const transactionId = `SIM-${this.requests.length}`;
    return { transactionId, checkoutUrl: `/sim-gateway/checkout/${transactionId}` };
  }

  async getStatus(transactionId: string): Promise<GatewayPaymentStatus> {
    const status = this.statuses.get(transactionId);
    if (!status) throw new AppError('NOT_FOUND', 'The gateway has no such payment.');
    return status;
  }
}

function setup() {
  const store = new MemoryPaymentStore();
  const gateway = new FakeGateway();
  const { audit, entries } = memoryAudit();
  let next = 0;
  const deps: PaymentDeps = {
    payments: store,
    gateway,
    audit,
    newId: () => `payment-${++next}`,
  };
  return { store, gateway, entries, deps };
}

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('startBillPayment', () => {
  it('moves an Unpaid bill to Payment pending and asks the gateway for the total (TC-R01-03)', async () => {
    const { store, gateway, entries, deps } = setup();
    const bill = store.addBill({ totalPoisha: 412_550 });

    const started = await startBillPayment(deps, RESIDENT, bill.id, NOW);

    expect(started).toEqual({
      paymentId: 'payment-1',
      transactionId: 'SIM-1',
      checkoutUrl: '/sim-gateway/checkout/SIM-1',
    });
    expect(gateway.requests).toEqual([{ reference: 'payment-1', amountPoisha: 412_550 }]);
    expect(store.bills.get(bill.id)?.status).toBe('Payment pending');
    expect(store.payments).toEqual([
      {
        id: 'payment-1',
        billId: bill.id,
        gatewayTransactionId: 'SIM-1',
        amountPoisha: 412_550,
        startedById: 'resident-1',
        startedAt: NOW,
        confirmedAt: null,
        endedAt: null,
        endReason: null,
      },
    ]);
    expect(entries).toEqual([
      {
        actorId: 'resident-1',
        action: 'bill.start_payment',
        entityType: 'bills',
        entityId: bill.id,
        oldValues: { status: 'Unpaid' },
        newValues: {
          status: 'Payment pending',
          paymentId: 'payment-1',
          gatewayTransactionId: 'SIM-1',
          amountPoisha: 412_550,
        },
      },
    ]);
  });

  it('makes its own payment id when none is given', async () => {
    const { store, deps } = setup();
    const bill = store.addBill();

    const started = await startBillPayment({ ...deps, newId: undefined }, RESIDENT, bill.id, NOW);

    expect(started.paymentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['Payment pending', PAYMENT_ERRORS.inProgress],
    ['Awaiting verification', PAYMENT_ERRORS.inProgress],
    ['Paid', PAYMENT_ERRORS.paid],
    ['Carried forward', PAYMENT_ERRORS.carriedForward],
  ] as const)(
    'refuses a bill that is %s, and starts nothing (TC-R01-04)',
    async (status, message) => {
      const { store, gateway, entries, deps } = setup();
      const bill = store.addBill({ status });

      const error = await refusal(startBillPayment(deps, RESIDENT, bill.id, NOW));

      expect(error.status).toBe(409);
      expect(error.message).toBe(message);
      expect(error.details).toEqual({ status });
      expect(gateway.requests).toEqual([]);
      expect(store.payments).toEqual([]);
      expect(entries).toEqual([]);
    },
  );

  it('refuses when the bill stops being Unpaid while the payment starts, so two taps make one payment', async () => {
    const { store, entries, deps } = setup();
    const bill = store.addBill();
    store.race('Payment pending');

    const error = await refusal(startBillPayment(deps, RESIDENT, bill.id, NOW));

    expect(error.status).toBe(409);
    expect(error.message).toBe(PAYMENT_ERRORS.changed);
    expect(store.payments).toEqual([]);
    expect(entries).toEqual([]);
  });

  it("refuses another household's bill (TC-R01-20)", async () => {
    const { store, gateway, deps } = setup();
    const bill = store.addBill({ occupancyId: 'occ-2' });

    const error = await refusal(startBillPayment(deps, RESIDENT, bill.id, NOW));

    expect(error.status).toBe(403);
    expect(error.message).toBe(PAYMENT_ERRORS.notYours);
    expect(gateway.requests).toEqual([]);
  });

  it("refuses a vacant flat's bill, which belongs to no household (BR-09)", async () => {
    const { store, deps } = setup();
    const bill = store.addBill({ occupancyId: null });

    const error = await refusal(startBillPayment(deps, RESIDENT, bill.id, NOW));

    expect(error.status).toBe(403);
  });

  it('refuses a bill that does not exist', async () => {
    const { deps } = setup();

    const error = await refusal(startBillPayment(deps, RESIDENT, 'no-such-bill', NOW));

    expect(error.status).toBe(404);
    expect(error.message).toBe(PAYMENT_ERRORS.notFound);
  });

  it('saves nothing when the gateway refuses to start the payment', async () => {
    const { store, gateway, entries, deps } = setup();
    const bill = store.addBill();
    gateway.createPayment = async () => {
      throw new AppError('BAD_REQUEST', 'The amount must be a whole number of poisha above 0.');
    };

    const error = await refusal(startBillPayment(deps, RESIDENT, bill.id, NOW));

    expect(error.status).toBe(400);
    expect(store.bills.get(bill.id)?.status).toBe('Unpaid');
    expect(store.payments).toEqual([]);
    expect(entries).toEqual([]);
  });
});

const SECRET = 'test-gateway-secret';
const ARRIVED = new Date('2026-11-25T10:02:00+06:00');

/** A gateway message about a payment, signed unless a signature is given. */
function message(
  payment: Payment,
  overrides: Partial<GatewayPaymentStatus> = {},
  signature?: string | null,
): { body: string; signature: string | null } {
  const body = JSON.stringify({
    transactionId: payment.gatewayTransactionId,
    reference: payment.id,
    amountPoisha: payment.amountPoisha,
    state: 'Succeeded',
    reason: null,
    ...overrides,
  });
  return {
    body,
    signature: signature === undefined ? signGatewayMessage(body, SECRET) : signature,
  };
}

/** A bill that is Payment pending with its open payment. */
function pendingBill(store: MemoryPaymentStore, overrides: Partial<PayableBill> = {}) {
  const bill = store.addBill({ status: 'Payment pending', ...overrides });
  const payment = store.addPayment({ billId: bill.id, amountPoisha: bill.totalPoisha });
  return { bill, payment };
}

describe('receiveGatewayMessage', () => {
  it('makes a Payment pending bill Paid with a receipt (TC-R01-05)', async () => {
    const { store, entries, deps } = setup();
    const { bill, payment } = pendingBill(store);

    const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

    expect(result).toEqual({ outcome: 'paid', receiptNumber: 101 });
    expect(store.bills.get(bill.id)?.status).toBe('Paid');
    expect(store.receipts).toEqual([
      {
        number: 101,
        billId: bill.id,
        paymentId: payment.id,
        amountPoisha: 350_000,
        paidAt: ARRIVED,
      },
    ]);
    expect(store.payments[0]?.confirmedAt).toEqual(ARRIVED);
    expect(entries).toEqual([
      {
        actorId: null,
        action: 'bill.confirm_payment',
        entityType: 'bills',
        entityId: bill.id,
        oldValues: { status: 'Payment pending' },
        newValues: {
          status: 'Paid',
          paymentId: payment.id,
          gatewayTransactionId: payment.gatewayTransactionId,
          receiptNumber: 101,
        },
      },
    ]);
  });

  it('makes a bill that timed out back to Unpaid Paid when the confirmation comes late (TC-R01-07)', async () => {
    const { store, deps } = setup();
    const bill = store.addBill({ status: 'Unpaid' });
    const payment = store.addPayment({
      billId: bill.id,
      endedAt: new Date('2026-11-25T09:30:00+06:00'),
      endReason: 'No payment arrived within 30 minutes. You can pay again.',
    });

    const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

    expect(result.outcome).toBe('paid');
    expect(store.bills.get(bill.id)?.status).toBe('Paid');
    expect(store.payments[0]).toMatchObject({
      confirmedAt: ARRIVED,
      endedAt: null,
      endReason: null,
    });
  });

  it('changes nothing when the same confirmation arrives twice (TC-R01-08)', async () => {
    const { store, entries, deps } = setup();
    const { payment } = pendingBill(store);
    const sent = message(payment);

    await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);
    const again = await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);

    expect(again).toEqual({ outcome: 'repeat' });
    expect(store.receipts).toHaveLength(1);
    expect(store.overpayments).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it.each(['Paid', 'Awaiting verification', 'Carried forward'] as const)(
    'flags an overpayment and leaves a %s bill alone (TC-R01-09)',
    async (status) => {
      const { store, entries, deps } = setup();
      const bill = store.addBill({ status });
      const payment = store.addPayment({ billId: bill.id });

      const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

      expect(result).toEqual({ outcome: 'overpayment' });
      expect(store.bills.get(bill.id)?.status).toBe(status);
      expect(store.receipts).toEqual([]);
      expect(store.overpayments).toEqual([
        { billId: bill.id, paymentId: payment.id, amountPoisha: 350_000 },
      ]);
      expect(store.payments[0]?.confirmedAt).toEqual(ARRIVED);
      expect(entries).toEqual([
        {
          actorId: null,
          action: 'bill.overpayment',
          entityType: 'bills',
          entityId: bill.id,
          oldValues: { status },
          newValues: {
            status,
            paymentId: payment.id,
            gatewayTransactionId: payment.gatewayTransactionId,
            amountPoisha: 350_000,
          },
        },
      ]);
    },
  );

  it('flags an overpayment only once when its confirmation repeats', async () => {
    const { store, deps } = setup();
    const bill = store.addBill({ status: 'Paid' });
    const payment = store.addPayment({ billId: bill.id });
    const sent = message(payment);

    await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);
    const again = await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);

    expect(again.outcome).toBe('repeat');
    expect(store.overpayments).toHaveLength(1);
  });

  it('flags an overpayment when an Unpaid bill was corrected to another total after the payment started (BR-06)', async () => {
    const { store, deps } = setup();
    const bill = store.addBill({ status: 'Unpaid', totalPoisha: 300_000 });
    const payment = store.addPayment({ billId: bill.id, amountPoisha: 350_000 });

    const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

    expect(result.outcome).toBe('overpayment');
    expect(store.bills.get(bill.id)?.status).toBe('Unpaid');
  });

  it('flags an overpayment when the manager settles the bill just before the confirmation is saved', async () => {
    const { store, deps } = setup();
    const { bill, payment } = pendingBill(store);
    store.race('Paid');

    const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

    expect(result.outcome).toBe('overpayment');
    expect(store.bills.get(bill.id)?.status).toBe('Paid');
    expect(store.receipts).toEqual([]);
  });

  it('pays the bill when it went from Payment pending to Unpaid just before the write', async () => {
    const { store, deps } = setup();
    const { bill, payment } = pendingBill(store);
    store.race('Unpaid');

    const result = await receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED);

    expect(result.outcome).toBe('paid');
    expect(store.bills.get(bill.id)?.status).toBe('Paid');
  });

  it('gives up with a conflict when the bill keeps changing under it', async () => {
    const { store, deps } = setup();
    const { payment } = pendingBill(store);
    store.race('Unpaid', 'Payment pending');

    const error = await refusal(receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED));

    expect(error.status).toBe(409);
    expect(store.receipts).toEqual([]);
  });

  it.each([
    ['missing', null],
    ['wrong', signGatewayMessage('another body', SECRET)],
  ])('refuses a %s signature and changes nothing (TC-R01-10)', async (_label, signature) => {
    const { store, entries, deps } = setup();
    const { bill, payment } = pendingBill(store);

    const error = await refusal(
      receiveGatewayMessage(deps, SECRET, message(payment, {}, signature), ARRIVED),
    );

    expect(error.status).toBe(401);
    expect(error.message).toBe(GATEWAY_MESSAGE_ERRORS.signature);
    expect(store.bills.get(bill.id)?.status).toBe('Payment pending');
    expect(entries).toEqual([]);
  });

  it('refuses every message when the secret is not set', async () => {
    const { store, deps } = setup();
    const { payment } = pendingBill(store);

    const error = await refusal(receiveGatewayMessage(deps, '', message(payment), ARRIVED));

    expect(error.status).toBe(401);
  });

  it.each([
    ['less', 349_999],
    ['more', 350_001],
  ])('refuses a confirmation for %s than the bill total (TC-R01-11)', async (_label, amount) => {
    const { store, deps } = setup();
    const { bill, payment } = pendingBill(store);

    const error = await refusal(
      receiveGatewayMessage(deps, SECRET, message(payment, { amountPoisha: amount }), ARRIVED),
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe(PAYMENT_ERRORS.amount);
    expect(error.details).toEqual({ expected: 350_000, received: amount });
    expect(store.bills.get(bill.id)?.status).toBe('Payment pending');
    expect(store.receipts).toEqual([]);
  });

  it('refuses a message whose reference is another payment', async () => {
    const { store, deps } = setup();
    const { payment } = pendingBill(store);

    const error = await refusal(
      receiveGatewayMessage(deps, SECRET, message(payment, { reference: 'payment-9' }), ARRIVED),
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe(GATEWAY_MESSAGE_ERRORS.body);
  });

  it('refuses a signed message that is not valid', async () => {
    const { deps } = setup();
    const body = '{"state":"Succeeded"}';
    const signed = { body, signature: signGatewayMessage(body, SECRET) };

    const error = await refusal(receiveGatewayMessage(deps, SECRET, signed, ARRIVED));

    expect(error.status).toBe(400);
  });

  it('refuses a payment the app never started', async () => {
    const { store, deps } = setup();
    const { payment } = pendingBill(store);
    const unknown = message(payment, { transactionId: 'SIM-UNKNOWN' });

    const error = await refusal(receiveGatewayMessage(deps, SECRET, unknown, ARRIVED));

    expect(error.status).toBe(404);
    expect(error.message).toBe(PAYMENT_ERRORS.unknownPayment);
  });

  it('refuses a confirmation whose bill has gone', async () => {
    const { store, deps } = setup();
    const { bill, payment } = pendingBill(store);
    store.bills.delete(bill.id);

    const error = await refusal(receiveGatewayMessage(deps, SECRET, message(payment), ARRIVED));

    expect(error.status).toBe(404);
  });

  it('puts the bill back to Unpaid with the gateway reason when the payment fails (TC-R01-17)', async () => {
    const { store, entries, deps } = setup();
    const { bill, payment } = pendingBill(store);
    const failed = message(payment, { state: 'Failed', reason: 'The payment was declined.' });

    const result = await receiveGatewayMessage(deps, SECRET, failed, ARRIVED);

    expect(result).toEqual({ outcome: 'ended' });
    expect(store.bills.get(bill.id)?.status).toBe('Unpaid');
    expect(store.payments[0]).toMatchObject({
      endedAt: ARRIVED,
      endReason: 'The payment was declined.',
    });
    expect(entries).toEqual([
      {
        actorId: null,
        action: 'bill.end_payment',
        entityType: 'bills',
        entityId: bill.id,
        oldValues: { status: 'Payment pending' },
        newValues: {
          status: 'Unpaid',
          paymentId: payment.id,
          gatewayTransactionId: payment.gatewayTransactionId,
          reason: 'The payment was declined.',
        },
      },
    ]);
  });

  it('uses its own reason when a cancelled payment comes with none, and ends it only once', async () => {
    const { store, entries, deps } = setup();
    const { payment } = pendingBill(store);
    const sent = message(payment, { state: 'Cancelled', reason: null });

    await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);
    const again = await receiveGatewayMessage(deps, SECRET, sent, ARRIVED);

    expect(store.payments[0]?.endReason).toBe(PAYMENT_END_REASONS.failed);
    expect(again).toEqual({ outcome: 'repeat' });
    expect(entries).toHaveLength(1);
  });

  it('changes nothing for a payment that is still Pending at the gateway', async () => {
    const { store, entries, deps } = setup();
    const { bill, payment } = pendingBill(store);
    const stillPending = message(payment, { state: 'Pending' });

    const result = await receiveGatewayMessage(deps, SECRET, stillPending, ARRIVED);

    expect(result).toEqual({ outcome: 'pending' });
    expect(store.bills.get(bill.id)?.status).toBe('Payment pending');
    expect(entries).toEqual([]);
  });
});
