/**
 * Tests for the manager bill correction API.
 * BB-0508, BM-03, BR-07, NFR-06.
 *
 * @author Jannatul Ferdus Nishi
 */

import { POST } from './route';

import type { Profile } from '@/models';
import { makeProfile } from '@/services/testFakes';

let mockSignedIn: Profile | null = null;

const mockCorrectUnpaidBill = jest.fn();

const BILL_ID = '123e4567-e89b-42d3-a456-426614174000';

jest.mock('@/lib/auth', () => {
  const { checkRole } = jest.requireActual('@/lib/permissions');
  const { AppError } = jest.requireActual('@/lib/errors');

  return {
    requireRole: async (_request: Request, action: string) => {
      if (!mockSignedIn) {
        throw new AppError('UNAUTHORIZED', 'Log in first.');
      }

      return checkRole(mockSignedIn, action);
    },
  };
});

jest.mock('@/lib/db', () => ({
  db: {},
}));

jest.mock('@/lib/adapters/billCorrectionAdapters', () => ({
  databaseBillCorrectionStore: () => ({}),
}));

jest.mock('@/services/billCorrectionService', () => ({
  correctUnpaidBill: (...args: unknown[]) => mockCorrectUnpaidBill(...args),
}));

function request(
  body: unknown = {
    adjustmentPoisha: -50000,
    reason: 'Incorrect generator charge',
  },
): Request {
  return new Request(`http://localhost:3000/api/manager/bills/${BILL_ID}/correct`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function context(id = BILL_ID) {
  return {
    params: Promise.resolve({ id }),
  };
}

describe('POST /api/manager/bills/[id]/correct', () => {
  beforeEach(() => {
    mockSignedIn = null;
    mockCorrectUnpaidBill.mockReset();

    mockCorrectUnpaidBill.mockResolvedValue({
      billId: BILL_ID,
      previousTotalPoisha: 300000,
      newTotalPoisha: 250000,
      adjustmentPoisha: -50000,
      excessCreditPoisha: 0,
      status: 'Unpaid',
    });
  });

  it('allows a manager to correct an unpaid bill', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      occupancyId: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toMatchObject({
      correction: {
        newTotalPoisha: 250000,
        status: 'Unpaid',
      },
    });

    expect(mockCorrectUnpaidBill).toHaveBeenCalledWith(
      expect.objectContaining({
        store: expect.anything(),
      }),
      {
        billId: BILL_ID,
        managerId: mockSignedIn.id,
        adjustmentPoisha: -50000,
        reason: 'Incorrect generator charge',
      },
    );
  });

  it('rejects a signed-out user', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(mockCorrectUnpaidBill).not.toHaveBeenCalled();
  });

  it.each(['resident', 'guard', 'committee', 'maintenance', 'admin'] as const)(
    'rejects a %s user',
    async (role) => {
      mockSignedIn = makeProfile({
        role,
        occupancyId: null,
      });

      const response = await POST(request(), context());

      expect(response.status).toBe(403);
      expect(mockCorrectUnpaidBill).not.toHaveBeenCalled();
    },
  );

  it('rejects a manager who must change password', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      mustChangePassword: true,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mockCorrectUnpaidBill).not.toHaveBeenCalled();
  });

  it('rejects a missing adjustment amount', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
    });

    const response = await POST(request({ reason: 'Correction' }), context());

    expect(response.status).toBe(400);
    expect(mockCorrectUnpaidBill).not.toHaveBeenCalled();
  });

  it('rejects an invalid bill ID', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
    });

    const response = await POST(request(), context('invalid-id'));

    expect(response.status).toBe(400);
    expect(mockCorrectUnpaidBill).not.toHaveBeenCalled();
  });

  it('uses the signed-in manager ID', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
    });

    await POST(
      request({
        adjustmentPoisha: -50000,
        reason: 'Correction',
        managerId: 'someone-else',
      }),
      context(),
    );

    expect(mockCorrectUnpaidBill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        managerId: mockSignedIn.id,
      }),
    );
  });

  it('returns 409 when correction is refused', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
    });

    const { AppError } = jest.requireActual('@/lib/errors');

    mockCorrectUnpaidBill.mockRejectedValueOnce(
      new AppError('CONFLICT', 'Only Unpaid bills can be corrected'),
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
  });
});
