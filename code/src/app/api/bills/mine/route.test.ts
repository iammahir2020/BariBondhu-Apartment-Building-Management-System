/**
 * Role-check tests for `GET /api/bills/mine` (RES-01, NFR-06): the role check runs first, a refused role reads
 * nothing, and a failed re-check never stops Dues from loading.
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import { listMyBills } from '@/services/myBillsService';
import { recheckPendingPayments } from '@/services/paymentService';
import { makeProfile } from '@/services/testFakes';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/paymentAdapters', () => ({
  databaseMyBillStore: jest.fn(() => ({})),
  databasePaymentDeps: jest.fn(() => ({})),
}));
jest.mock('@/services/myBillsService', () => ({ listMyBills: jest.fn() }));
jest.mock('@/services/paymentService', () => ({ recheckPendingPayments: jest.fn() }));

const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });
const request = () => new Request('http://localhost/api/bills/mine');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listMyBills).mockResolvedValue([]);
  jest.mocked(recheckPendingPayments).mockResolvedValue([]);
});

describe('permissions for bills (NFR-06)', () => {
  it('residents and the manager see bills; only residents pay', () => {
    expect(rolesFor('viewBills')).toEqual(['resident', 'manager']);
    expect(rolesFor('payBill')).toEqual(['resident']);
  });
});

describe('GET /api/bills/mine', () => {
  it('checks viewBills first, re-checks due payments, then lists my bills', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });

    const response = await GET(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewBills');
    expect(recheckPendingPayments).toHaveBeenCalledWith({}, expect.any(Date));
    expect(listMyBills).toHaveBeenCalledWith({}, RESIDENT);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bills: [] });
  });

  it('still lists the bills when the re-check fails', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
    jest.mocked(recheckPendingPayments).mockRejectedValue(new Error('connect ETIMEDOUT'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(listMyBills).toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    [401, new AppError('UNAUTHORIZED', 'Your session has ended. Log in again.')],
    [403, new AppError('FORBIDDEN', FORBIDDEN_MESSAGE)],
  ])(
    'answers %i and reads nothing when the role check refuses (TC-R01-21)',
    async (status, error) => {
      jest.mocked(requireRole).mockRejectedValue(error);

      const response = await GET(request());

      expect(response.status).toBe(status);
      expect(recheckPendingPayments).not.toHaveBeenCalled();
      expect(listMyBills).not.toHaveBeenCalled();
    },
  );
});
