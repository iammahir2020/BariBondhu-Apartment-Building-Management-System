/**
 * Role-check tests for `POST /api/bills/[id]/payments` (RES-01, NFR-06): the role check runs first, a refused role
 * starts nothing, a bad id is a missing bill, and the service's refusals reach the client unchanged.
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import { PAYMENT_ERRORS, startBillPayment } from '@/services/paymentService';
import { makeProfile } from '@/services/testFakes';
import { POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/paymentAdapters', () => ({ databasePaymentDeps: jest.fn(() => ({})) }));
jest.mock('@/services/paymentService', () => ({
  ...jest.requireActual('@/services/paymentService'),
  startBillPayment: jest.fn(),
}));

const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });
const BILL_ID = '0b9c6d1e-2f3a-4b5c-8d7e-9f0a1b2c3d4e';

function pay(id = BILL_ID) {
  return POST(new Request(`http://localhost/api/bills/${id}/payments`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/bills/[id]/payments', () => {
  it('checks payBill first and answers 201 with where to pay (TC-R01-03)', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
    const started = {
      paymentId: 'payment-1',
      transactionId: 'SIM-1',
      checkoutUrl: '/sim-gateway/checkout/SIM-1',
    };
    jest.mocked(startBillPayment).mockResolvedValue(started);

    const response = await pay();

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'payBill');
    expect(startBillPayment).toHaveBeenCalledWith({}, RESIDENT, BILL_ID, expect.any(Date));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(started);
  });

  it.each([
    [401, new AppError('UNAUTHORIZED', 'Your session has ended. Log in again.')],
    [403, new AppError('FORBIDDEN', FORBIDDEN_MESSAGE)],
  ])(
    'answers %i and starts nothing when the role check refuses (TC-R01-21)',
    async (status, error) => {
      jest.mocked(requireRole).mockRejectedValue(error);

      const response = await pay();

      expect(response.status).toBe(status);
      expect(startBillPayment).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for an id that is not a UUID, without reaching the service', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });

    const response = await pay('not-a-bill');

    expect(response.status).toBe(404);
    expect(startBillPayment).not.toHaveBeenCalled();
  });

  it('passes on a 409 with the bill status (TC-R01-04)', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
    jest
      .mocked(startBillPayment)
      .mockRejectedValue(new AppError('CONFLICT', PAYMENT_ERRORS.paid, { status: 'Paid' }));

    const response = await pay();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'CONFLICT', message: PAYMENT_ERRORS.paid, details: { status: 'Paid' } },
    });
  });

  it("passes on a 403 for another household's bill (TC-R01-20)", async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
    jest
      .mocked(startBillPayment)
      .mockRejectedValue(new AppError('FORBIDDEN', PAYMENT_ERRORS.notYours));

    const response = await pay();

    expect(response.status).toBe(403);
  });
});
