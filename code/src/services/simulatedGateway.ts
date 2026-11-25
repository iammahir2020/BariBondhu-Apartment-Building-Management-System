/**
 * The simulated payment gateway (RES-01, SRS v1.6): the same flow as a real gateway sandbox, with no real money.
 * Starting a payment saves a Pending transaction and returns the test checkout's address
 * (`/sim-gateway/checkout/[txnId]`, BB-0608). The checkout's buttons then pay, fail or cancel it with
 * {@link SimulatedGateway.decide}, and the payment services can ask for its status at any time (BR-04).
 *
 * A transaction is decided once. Deciding it again is refused, as a real gateway never changes a finished payment.
 *
 * @author Mahir Al Kamal
 */
import { randomBytes } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { GatewayPaymentState, GatewayTransaction } from '@/models/GatewayTransaction';
import type {
  GatewayPaymentStatus,
  PaymentGateway,
  PaymentRequest,
  StartedPayment,
} from '@/services/paymentGateway';

/** Where the test checkout lives. */
export const SIM_CHECKOUT_PATH = '/sim-gateway/checkout';

/** How the checkout can end a payment. */
export type SimulatedOutcome = Exclude<GatewayPaymentState, 'Pending'>;

/** The reason the gateway gives for each outcome; a successful payment has none. */
export const SIM_REASONS: Readonly<Record<SimulatedOutcome, string | null>> = {
  Succeeded: null,
  Failed: 'The payment was declined.',
  Cancelled: 'You cancelled the payment.',
};

/** Error text of the simulated gateway. */
export const SIM_ERRORS = {
  reference: 'The payment has no reference.',
  amount: 'The amount must be a whole number of poisha above 0.',
  notFound: 'The gateway has no such payment.',
  decided: 'This payment is already finished.',
} as const;

/** The simulated gateway's own transactions. */
export interface GatewayTransactionStore {
  /** Saves a new Pending transaction. */
  insert(transaction: GatewayTransaction): Promise<void>;
  /** One transaction, or null if there is none with this id. */
  findById(id: string): Promise<GatewayTransaction | null>;
  /**
   * Pays, fails or cancels a transaction, but only while it is still Pending, in one write, so two clicks can't
   * both decide it.
   * @returns False if it was no longer Pending, so nothing changed.
   */
  decideIfPending(
    id: string,
    state: SimulatedOutcome,
    reason: string | null,
    at: Date,
  ): Promise<boolean>;
}

/** What the simulated gateway works with. */
export interface SimulatedGatewayDeps {
  transactions: GatewayTransactionStore;
  /** Makes transaction ids; tests pass a fixed one. */
  newTransactionId?: () => string;
  /** The current time; tests pass a fixed one. */
  now?: () => Date;
}

/** The simulated gateway: a {@link PaymentGateway}, plus what its test checkout needs. */
export interface SimulatedGateway extends PaymentGateway {
  /**
   * Pays, fails or cancels a Pending transaction, as the test checkout's buttons do.
   * @param transactionId - The transaction.
   * @param outcome - Succeeded, Failed or Cancelled.
   * @returns The transaction's status after the change.
   * @throws AppError 404 if there is no such transaction.
   * @throws AppError 409 if it was already paid, failed or cancelled.
   */
  decide(transactionId: string, outcome: SimulatedOutcome): Promise<GatewayPaymentStatus>;
}

/**
 * A transaction id like a sandbox's: `SIM-` and 12 hexadecimal characters from a secure random source.
 * @returns The id.
 */
export function newSimTransactionId(): string {
  return `SIM-${randomBytes(6).toString('hex').toUpperCase()}`;
}

/** The status a transaction reports. */
function toStatus(transaction: GatewayTransaction): GatewayPaymentStatus {
  return {
    transactionId: transaction.id,
    reference: transaction.reference,
    amountPoisha: transaction.amountPoisha,
    state: transaction.state,
    reason: transaction.reason,
  };
}

/**
 * Makes the simulated gateway.
 * @param deps - The transaction store, and optionally the id maker and the clock.
 * @returns The gateway.
 */
export function simulatedGateway(deps: SimulatedGatewayDeps): SimulatedGateway {
  const newId = deps.newTransactionId ?? newSimTransactionId;
  const now = deps.now ?? (() => new Date());

  async function find(transactionId: string): Promise<GatewayTransaction> {
    const transaction = await deps.transactions.findById(transactionId);
    if (!transaction) throw new AppError('NOT_FOUND', SIM_ERRORS.notFound);
    return transaction;
  }

  return {
    async createPayment({ reference, amountPoisha }: PaymentRequest): Promise<StartedPayment> {
      if (reference.trim() === '') throw new AppError('BAD_REQUEST', SIM_ERRORS.reference);
      if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
        throw new AppError('BAD_REQUEST', SIM_ERRORS.amount);
      }
      const transaction: GatewayTransaction = {
        id: newId(),
        reference,
        amountPoisha,
        state: 'Pending',
        reason: null,
        createdAt: now(),
        decidedAt: null,
      };
      await deps.transactions.insert(transaction);
      return {
        transactionId: transaction.id,
        checkoutUrl: `${SIM_CHECKOUT_PATH}/${encodeURIComponent(transaction.id)}`,
      };
    },

    async getStatus(transactionId) {
      return toStatus(await find(transactionId));
    },

    async decide(transactionId, outcome) {
      const transaction = await find(transactionId);
      if (transaction.state !== 'Pending') {
        throw new AppError('CONFLICT', SIM_ERRORS.decided, { state: transaction.state });
      }
      const at = now();
      const reason = SIM_REASONS[outcome];
      if (!(await deps.transactions.decideIfPending(transactionId, outcome, reason, at))) {
        const latest = await find(transactionId);
        throw new AppError('CONFLICT', SIM_ERRORS.decided, { state: latest.state });
      }
      return toStatus({ ...transaction, state: outcome, reason, decidedAt: at });
    },
  };
}
