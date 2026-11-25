/**
 * Role-check tests for `GET /api/bills/[id]/receipt` (RES-01, UC-R08, NFR-06).
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import { MY_BILL_ERRORS, getReceipt, type ReceiptView } from '@/services/myBillsService';
import { makeProfile } from '@/services/testFakes';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/paymentAdapters', () => ({ databaseMyBillStore: jest.fn(() => ({})) }));
jest.mock('@/services/myBillsService', () => ({
  ...jest.requireActual('@/services/myBillsService'),
  getReceipt: jest.fn(),
}));

const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });
const BILL_ID = '0b9c6d1e-2f3a-4b5c-8d7e-9f0a1b2c3d4e';

function receipt(id = BILL_ID) {
  return GET(new Request(`http://localhost/api/bills/${id}/receipt`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/bills/[id]/receipt', () => {
  it('checks viewBills first and returns the receipt (TC-R01-18)', async () => {
    const viewer = { actor: RESIDENT, scope: 'own' as const };
    jest.mocked(requireRole).mockResolvedValue(viewer);
    const view: ReceiptView = {
      receiptNumber: 'R-2611-0101',
      flatLabel: 'Block A, Flat 3B',
      billingMonth: '2026-11-01',
      lines: [],
      totalPoisha: 350_000,
      paidAt: new Date('2026-11-25T04:02:00Z'),
      method: 'Online',
      gatewayTransactionId: 'SIM-1',
    };
    jest.mocked(getReceipt).mockResolvedValue(view);

    const response = await receipt();

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewBills');
    expect(getReceipt).toHaveBeenCalledWith({}, viewer, BILL_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      receiptNumber: 'R-2611-0101',
      gatewayTransactionId: 'SIM-1',
      paidAt: '2026-11-25T04:02:00.000Z',
    });
  });

  it('answers 403 and reads nothing when the role check refuses', async () => {
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));

    const response = await receipt();

    expect(response.status).toBe(403);
    expect(getReceipt).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a UUID', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });

    const response = await receipt('R-2611-0101');

    expect(response.status).toBe(404);
    expect(getReceipt).not.toHaveBeenCalled();
  });

  it('passes on a 409 for a bill that is not Paid (TC-R01-19)', async () => {
    jest.mocked(requireRole).mockResolvedValue({ actor: RESIDENT, scope: 'own' });
    jest
      .mocked(getReceipt)
      .mockRejectedValue(new AppError('CONFLICT', MY_BILL_ERRORS.notPaid, { status: 'Unpaid' }));

    const response = await receipt();

    expect(response.status).toBe(409);
  });
});
