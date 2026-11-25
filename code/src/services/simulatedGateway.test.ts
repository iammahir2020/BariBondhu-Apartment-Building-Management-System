/**
 * Tests for the simulated payment gateway (RES-01, SRS v1.6): starting a payment, its status before and after the
 * test checkout decides it, deciding only once, and the ids it makes.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { GatewayTransaction } from '@/models';
import {
  SIM_CHECKOUT_PATH,
  SIM_ERRORS,
  SIM_REASONS,
  newSimTransactionId,
  simulatedGateway,
  type GatewayTransactionStore,
  type SimulatedOutcome,
} from '@/services/simulatedGateway';

const NOW = new Date('2026-11-25T10:00:00+06:00');
const LATER = new Date('2026-11-25T10:05:00+06:00');

/** An in-memory transaction store. */
class MemoryTransactionStore implements GatewayTransactionStore {
  readonly rows: GatewayTransaction[] = [];
  /** When set, the next conditional write loses to another click that got there first. */
  loseNextDecision: SimulatedOutcome | null = null;

  async insert(transaction: GatewayTransaction): Promise<void> {
    this.rows.push({ ...transaction });
  }

  async findById(id: string): Promise<GatewayTransaction | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async decideIfPending(
    id: string,
    state: SimulatedOutcome,
    reason: string | null,
    at: Date,
  ): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (this.loseNextDecision && row) {
      Object.assign(row, { state: this.loseNextDecision, decidedAt: at });
      this.loseNextDecision = null;
      return false;
    }
    if (!row || row.state !== 'Pending') return false;
    Object.assign(row, { state, reason, decidedAt: at });
    return true;
  }
}

function setup() {
  const transactions = new MemoryTransactionStore();
  let clock = NOW;
  let n = 0;
  const gateway = simulatedGateway({
    transactions,
    newTransactionId: () => `SIM-TEST0000000${++n}`,
    now: () => clock,
  });
  return {
    gateway,
    transactions,
    later: () => {
      clock = LATER;
    },
  };
}

/** Runs a call and returns the AppError it throws, or fails the test. */
async function errorFrom(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('createPayment', () => {
  it('saves a Pending transaction and returns its id and checkout address (TC-R01-03)', async () => {
    const { gateway, transactions } = setup();
    const started = await gateway.createPayment({ reference: 'payment-1', amountPoisha: 350_000 });

    expect(started).toEqual({
      transactionId: 'SIM-TEST00000001',
      checkoutUrl: `${SIM_CHECKOUT_PATH}/SIM-TEST00000001`,
    });
    expect(transactions.rows).toEqual([
      {
        id: 'SIM-TEST00000001',
        reference: 'payment-1',
        amountPoisha: 350_000,
        state: 'Pending',
        reason: null,
        createdAt: NOW,
        decidedAt: null,
      },
    ]);
  });

  it('accepts the smallest amount, 1 poisha', async () => {
    const { gateway } = setup();
    await expect(
      gateway.createPayment({ reference: 'payment-1', amountPoisha: 1 }),
    ).resolves.toMatchObject({ transactionId: 'SIM-TEST00000001' });
  });

  it('makes a new transaction for every payment started', async () => {
    const { gateway, transactions } = setup();
    await gateway.createPayment({ reference: 'payment-1', amountPoisha: 100 });
    await gateway.createPayment({ reference: 'payment-1', amountPoisha: 100 });
    expect(transactions.rows.map((r) => r.id)).toEqual(['SIM-TEST00000001', 'SIM-TEST00000002']);
  });

  it.each([0, -100, 12.5, Number.NaN])('refuses an amount of %p (BR-06)', async (amountPoisha) => {
    const { gateway, transactions } = setup();
    const error = await errorFrom(() =>
      gateway.createPayment({ reference: 'payment-1', amountPoisha }),
    );
    expect(error).toMatchObject({ status: 400, message: SIM_ERRORS.amount });
    expect(transactions.rows).toHaveLength(0);
  });

  it('refuses a payment with no reference', async () => {
    const { gateway, transactions } = setup();
    const error = await errorFrom(() =>
      gateway.createPayment({ reference: '  ', amountPoisha: 100 }),
    );
    expect(error).toMatchObject({ status: 400, message: SIM_ERRORS.reference });
    expect(transactions.rows).toHaveLength(0);
  });
});

describe('getStatus', () => {
  it('reports a new payment as Pending (TC-R01-13)', async () => {
    const { gateway } = setup();
    const { transactionId } = await gateway.createPayment({
      reference: 'payment-1',
      amountPoisha: 350_000,
    });
    await expect(gateway.getStatus(transactionId)).resolves.toEqual({
      transactionId,
      reference: 'payment-1',
      amountPoisha: 350_000,
      state: 'Pending',
      reason: null,
    });
  });

  it('reports a paid payment as Succeeded (TC-R01-15)', async () => {
    const { gateway } = setup();
    const { transactionId } = await gateway.createPayment({ reference: 'p', amountPoisha: 100 });
    await gateway.decide(transactionId, 'Succeeded');
    await expect(gateway.getStatus(transactionId)).resolves.toMatchObject({
      state: 'Succeeded',
      reason: null,
    });
  });

  it('answers 404 for a transaction it never made', async () => {
    const { gateway } = setup();
    const error = await errorFrom(() => gateway.getStatus('SIM-NOPE'));
    expect(error).toMatchObject({ status: 404, message: SIM_ERRORS.notFound });
  });
});

describe('decide', () => {
  it.each<SimulatedOutcome>(['Succeeded', 'Failed', 'Cancelled'])(
    'ends a Pending payment as %s, with the gateway reason (TC-R01-17)',
    async (outcome) => {
      const { gateway, transactions, later } = setup();
      const { transactionId } = await gateway.createPayment({
        reference: 'payment-1',
        amountPoisha: 100,
      });
      later();
      const status = await gateway.decide(transactionId, outcome);

      expect(status).toEqual({
        transactionId,
        reference: 'payment-1',
        amountPoisha: 100,
        state: outcome,
        reason: SIM_REASONS[outcome],
      });
      expect(transactions.rows[0]).toMatchObject({
        state: outcome,
        reason: SIM_REASONS[outcome],
        decidedAt: LATER,
      });
    },
  );

  it('gives a reason for a failed and a cancelled payment, and none for a paid one', () => {
    expect(SIM_REASONS).toEqual({
      Succeeded: null,
      Failed: 'The payment was declined.',
      Cancelled: 'You cancelled the payment.',
    });
  });

  it('refuses to decide a payment twice, and keeps the first outcome', async () => {
    const { gateway, transactions } = setup();
    const { transactionId } = await gateway.createPayment({ reference: 'p', amountPoisha: 100 });
    await gateway.decide(transactionId, 'Succeeded');

    const error = await errorFrom(() => gateway.decide(transactionId, 'Failed'));
    expect(error).toMatchObject({
      status: 409,
      message: SIM_ERRORS.decided,
      details: { state: 'Succeeded' },
    });
    expect(transactions.rows[0]?.state).toBe('Succeeded');
  });

  it('refuses when another click decided it between the read and the write', async () => {
    const { gateway, transactions } = setup();
    const { transactionId } = await gateway.createPayment({ reference: 'p', amountPoisha: 100 });
    transactions.loseNextDecision = 'Cancelled';

    const error = await errorFrom(() => gateway.decide(transactionId, 'Succeeded'));
    expect(error).toMatchObject({ status: 409, details: { state: 'Cancelled' } });
  });

  it('answers 404 for a transaction it never made', async () => {
    const { gateway } = setup();
    const error = await errorFrom(() => gateway.decide('SIM-NOPE', 'Succeeded'));
    expect(error).toMatchObject({ status: 404, message: SIM_ERRORS.notFound });
  });
});

describe('the defaults', () => {
  it('makes ids like SIM-1A2B3C4D5E6F, different each time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSimTransactionId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^SIM-[0-9A-F]{12}$/);
  });

  it('uses real ids and the real clock when none are given', async () => {
    const transactions = new MemoryTransactionStore();
    const gateway = simulatedGateway({ transactions });
    const before = Date.now();
    const { transactionId, checkoutUrl } = await gateway.createPayment({
      reference: 'p',
      amountPoisha: 100,
    });
    expect(transactionId).toMatch(/^SIM-[0-9A-F]{12}$/);
    expect(checkoutUrl).toBe(`${SIM_CHECKOUT_PATH}/${transactionId}`);
    expect(transactions.rows[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
