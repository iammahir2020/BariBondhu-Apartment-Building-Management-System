/**
 * Tests for the simulated gateway's test checkout (RES-01, BB-0608): the four buttons, the held-back confirmation and
 * the signed message the app receives.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { GatewayTransaction } from '@/models';
import { isValidGatewaySignature, parseGatewayMessage } from '@/services/gatewayMessage';
import type { GatewayMessage } from '@/services/paymentService';
import {
  CHECKOUT_ERRORS,
  finishCheckout,
  readCheckoutChoice,
  sendLateConfirmation,
  signedGatewayMessage,
  type CheckoutDeps,
} from '@/services/simulatedCheckout';
import { simulatedGateway, type GatewayTransactionStore } from '@/services/simulatedGateway';

const SECRET = 'test-gateway-secret';
const NOW = new Date('2026-11-25T10:00:00+06:00');

/** An in-memory transaction store. */
function memoryTransactions(): GatewayTransactionStore {
  const rows: GatewayTransaction[] = [];
  return {
    async insert(transaction) {
      rows.push({ ...transaction });
    },
    async findById(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : null;
    },
    async decideIfPending(id, state, reason, at) {
      const row = rows.find((r) => r.id === id && r.state === 'Pending');
      if (!row) return false;
      Object.assign(row, { state, reason, decidedAt: at });
      return true;
    },
  };
}

async function setup() {
  const gateway = simulatedGateway({
    transactions: memoryTransactions(),
    newTransactionId: () => 'SIM-1',
    now: () => NOW,
  });
  await gateway.createPayment({ reference: 'payment-1', amountPoisha: 485_000 });
  const delivered: GatewayMessage[] = [];
  const deps: CheckoutDeps = {
    gateway,
    secret: SECRET,
    deliver: async (message) => {
      delivered.push(message);
      return { outcome: 'paid' };
    },
  };
  return { gateway, delivered, deps };
}

describe('readCheckoutChoice', () => {
  it.each(['pay', 'pay_late', 'fail', 'cancel'])('accepts %s', (choice) => {
    expect(readCheckoutChoice(choice)).toBe(choice);
  });

  it.each([undefined, null, 'Pay', 'refund', 3])('refuses %p', (value) => {
    let caught: unknown;
    try {
      readCheckoutChoice(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).message).toBe(CHECKOUT_ERRORS.choice);
  });
});

describe('signedGatewayMessage', () => {
  it('signs the JSON of the status so the webhook accepts it', () => {
    const status = {
      transactionId: 'SIM-1',
      reference: 'payment-1',
      amountPoisha: 485_000,
      state: 'Succeeded' as const,
      reason: null,
    };

    const message = signedGatewayMessage(status, SECRET);

    expect(parseGatewayMessage(message.body)).toEqual(status);
    expect(isValidGatewaySignature(message.body, message.signature, SECRET)).toBe(true);
  });
});

describe('finishCheckout', () => {
  it('pays and sends the signed confirmation at once', async () => {
    const { delivered, deps } = await setup();

    const result = await finishCheckout(deps, 'SIM-1', 'pay');

    expect(result).toMatchObject({ delivered: true, deliveryError: null });
    expect(result.status).toMatchObject({ state: 'Succeeded', amountPoisha: 485_000 });
    expect(delivered).toHaveLength(1);
    const sent = delivered[0] as GatewayMessage;
    expect(isValidGatewaySignature(sent.body, sent.signature, SECRET)).toBe(true);
    expect(parseGatewayMessage(sent.body)).toMatchObject({
      transactionId: 'SIM-1',
      reference: 'payment-1',
      state: 'Succeeded',
    });
  });

  it.each([
    ['fail', 'Failed', 'The payment was declined.'],
    ['cancel', 'Cancelled', 'You cancelled the payment.'],
  ] as const)('%s sends the %s message with its reason', async (choice, state, reason) => {
    const { delivered, deps } = await setup();

    await finishCheckout(deps, 'SIM-1', choice);

    expect(parseGatewayMessage(delivered[0]?.body ?? '')).toMatchObject({ state, reason });
  });

  it('pays but holds the confirmation back for "Pay but confirm late"', async () => {
    const { gateway, delivered, deps } = await setup();

    const result = await finishCheckout(deps, 'SIM-1', 'pay_late');

    expect(result).toMatchObject({ delivered: false, deliveryError: null });
    expect((await gateway.getStatus('SIM-1')).state).toBe('Succeeded');
    expect(delivered).toEqual([]);
  });

  it("keeps the gateway's side when the app refuses the message, and says why", async () => {
    const { gateway, deps } = await setup();
    deps.deliver = async () => {
      throw new AppError('CONFLICT', 'This bill changed while you were paying. Open Dues again.');
    };

    const result = await finishCheckout(deps, 'SIM-1', 'pay');

    expect(result).toMatchObject({
      delivered: false,
      deliveryError: 'This bill changed while you were paying. Open Dues again.',
    });
    expect((await gateway.getStatus('SIM-1')).state).toBe('Succeeded');
  });

  it('reports a delivery failure that is not an Error', async () => {
    const { deps } = await setup();
    deps.deliver = async () => {
      throw 'network down';
    };

    const result = await finishCheckout(deps, 'SIM-1', 'pay');

    expect(result.deliveryError).toBe('network down');
  });

  it('refuses a transaction that is already finished, and sends nothing', async () => {
    const { delivered, deps } = await setup();
    await finishCheckout(deps, 'SIM-1', 'cancel');

    await expect(finishCheckout(deps, 'SIM-1', 'pay')).rejects.toMatchObject({ status: 409 });
    expect(delivered).toHaveLength(1);
  });
});

describe('sendLateConfirmation', () => {
  it('sends the held-back confirmation of a paid transaction', async () => {
    const { delivered, deps } = await setup();
    await finishCheckout(deps, 'SIM-1', 'pay_late');

    const result = await sendLateConfirmation(deps, 'SIM-1');

    expect(result.delivered).toBe(true);
    expect(parseGatewayMessage(delivered[0]?.body ?? '').state).toBe('Succeeded');
  });

  it.each([
    ['still pending', null],
    ['cancelled', 'cancel'],
  ] as const)('refuses a transaction that is %s', async (_label, choice) => {
    const { delivered, deps } = await setup();
    if (choice) await finishCheckout(deps, 'SIM-1', choice);
    delivered.length = 0;

    await expect(sendLateConfirmation(deps, 'SIM-1')).rejects.toMatchObject({
      status: 409,
      message: CHECKOUT_ERRORS.notPaid,
    });
    expect(delivered).toEqual([]);
  });
});
