/**
 * Role-check tests for the simulated gateway's checkout routes (RES-01, BB-0608, NFR-06): showing a transaction,
 * finishing it with a button, and sending a held-back confirmation.
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { databaseCheckoutDeps } from '@/lib/adapters/paymentAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import {
  CHECKOUT_ERRORS,
  finishCheckout,
  sendLateConfirmation,
} from '@/services/simulatedCheckout';
import { makeProfile } from '@/services/testFakes';
import { POST as CONFIRM } from './confirmation/route';
import { GET, POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/paymentAdapters', () => ({ databaseCheckoutDeps: jest.fn() }));
jest.mock('@/services/simulatedCheckout', () => ({
  ...jest.requireActual('@/services/simulatedCheckout'),
  finishCheckout: jest.fn(),
  sendLateConfirmation: jest.fn(),
}));

const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });
const STATUS = {
  transactionId: 'SIM-1',
  reference: 'payment-1',
  amountPoisha: 485_000,
  state: 'Pending' as const,
  reason: null,
};
const getStatus = jest.fn();
const context = { params: Promise.resolve({ id: 'SIM-1' }) };
const url = 'http://localhost/api/sim-gateway/transactions/SIM-1';

function post(body: unknown) {
  return POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }), context);
}

beforeEach(() => {
  jest.clearAllMocks();
  getStatus.mockResolvedValue(STATUS);
  jest.mocked(databaseCheckoutDeps).mockReturnValue({
    gateway: { getStatus } as never,
    secret: 's',
    deliver: jest.fn(),
  });
});

function allow(): void {
  jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

describe('GET /api/sim-gateway/transactions/[id]', () => {
  it('checks payBill first and shows the transaction', async () => {
    allow();

    const response = await GET(new Request(url), context);

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'payBill');
    expect(getStatus).toHaveBeenCalledWith('SIM-1');
    expect(await response.json()).toEqual(STATUS);
  });

  it('answers 403 and reads nothing when the role is refused', async () => {
    refuse();

    const response = await GET(new Request(url), context);

    expect(response.status).toBe(403);
    expect(getStatus).not.toHaveBeenCalled();
  });
});

describe('POST /api/sim-gateway/transactions/[id]', () => {
  it('checks payBill first and finishes the transaction with the button', async () => {
    allow();
    const result = {
      status: { ...STATUS, state: 'Succeeded' },
      delivered: true,
      deliveryError: null,
    };
    jest.mocked(finishCheckout).mockResolvedValue(result as never);

    const response = await post({ choice: 'pay_late' });

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'payBill');
    expect(finishCheckout).toHaveBeenCalledWith(expect.anything(), 'SIM-1', 'pay_late');
    expect(await response.json()).toEqual(result);
  });

  it('answers 400 for an unknown button, and finishes nothing', async () => {
    allow();

    const response = await post({ choice: 'refund' });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe(
      CHECKOUT_ERRORS.choice,
    );
    expect(finishCheckout).not.toHaveBeenCalled();
  });

  it('answers 403 and finishes nothing when the role is refused', async () => {
    refuse();

    const response = await post({ choice: 'pay' });

    expect(response.status).toBe(403);
    expect(finishCheckout).not.toHaveBeenCalled();
  });
});

describe('POST /api/sim-gateway/transactions/[id]/confirmation', () => {
  it('checks payBill first and sends the held-back confirmation', async () => {
    allow();
    jest
      .mocked(sendLateConfirmation)
      .mockResolvedValue({ status: STATUS, delivered: true, deliveryError: null } as never);

    const response = await CONFIRM(new Request(`${url}/confirmation`, { method: 'POST' }), context);

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'payBill');
    expect(sendLateConfirmation).toHaveBeenCalledWith(expect.anything(), 'SIM-1');
    expect(response.status).toBe(200);
  });

  it('answers 403 and sends nothing when the role is refused', async () => {
    refuse();

    const response = await CONFIRM(new Request(`${url}/confirmation`, { method: 'POST' }), context);

    expect(response.status).toBe(403);
    expect(sendLateConfirmation).not.toHaveBeenCalled();
  });
});
