/**
 * Tests for paying a bill online (RES-01): starting a payment (BB-0604). The store and the gateway are in memory.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { BillStatus } from '@/services/billStateMachine';
import type {
  GatewayPaymentStatus,
  PaymentGateway,
  PaymentRequest,
} from '@/services/paymentGateway';
import {
  PAYMENT_ERRORS,
  startBillPayment,
  type PayableBill,
  type PaymentDeps,
  type PaymentStore,
  type StartingPayment,
} from '@/services/paymentService';
import { makeProfile, memoryAudit } from '@/services/testFakes';

const NOW = new Date('2026-11-25T10:00:00+06:00');
const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });

/** A saved payment, as the in-memory store keeps it. */
interface StoredPayment extends StartingPayment {
  confirmedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
}

/** An in-memory bill and payment store. */
class MemoryPaymentStore implements PaymentStore {
  readonly bills = new Map<string, PayableBill>();
  readonly payments: StoredPayment[] = [];
  /** When set, another tab changes the bill to this status just before the conditional write. */
  raceTo: BillStatus | null = null;

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
    if (bill && this.raceTo) bill.status = this.raceTo;
    if (bill?.status !== 'Unpaid') return false;
    bill.status = 'Payment pending';
    this.payments.push({ ...payment, confirmedAt: null, endedAt: null, endReason: null });
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
    store.raceTo = 'Payment pending';

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
