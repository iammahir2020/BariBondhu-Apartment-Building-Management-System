/**
 * Tests for the manager bill listing API.
 * BB-0508, BM-03, NFR-06.
 *
 * @author Jannatul Ferdus Nishi
 */

import { GET } from './route';

import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Profile } from '@/models';
import { makeProfile } from '@/services/testFakes';

let mockSignedIn: Profile | null = null;

const mockListBills = jest.fn();

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

jest.mock('@/lib/adapters/managerBillAdapters', () => ({
  databaseManagerBillStore: () => ({
    listBills: mockListBills,
  }),
}));

function request(): Request {
  return new Request('http://localhost:3000/api/manager/bills');
}

describe('GET /api/manager/bills (BB-0508)', () => {
  beforeEach(() => {
    mockSignedIn = null;
    mockListBills.mockReset();
    mockListBills.mockResolvedValue([]);
  });

  it('allows a manager to list bills', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      occupancyId: null,
    });

    const bills = [
      {
        id: 'bill-1',
        totalPoisha: 300000,
        status: 'Unpaid',
      },
    ];

    mockListBills.mockResolvedValue(bills);

    const response = await GET(request());

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      bills,
    });

    expect(mockListBills).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when no bills exist', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      occupancyId: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      bills: [],
    });
  });

  it('rejects a signed-out user', async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockListBills).not.toHaveBeenCalled();
  });

  it.each(['resident', 'guard', 'committee', 'maintenance', 'admin'] as const)(
    'rejects a %s with 403',
    async (role) => {
      mockSignedIn = makeProfile({
        role,
        occupancyId: null,
      });

      const response = await GET(request());

      expect(response.status).toBe(403);

      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: 'FORBIDDEN',
          message: FORBIDDEN_MESSAGE,
        },
      });

      expect(mockListBills).not.toHaveBeenCalled();
    },
  );

  it('rejects a manager who must change password', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      occupancyId: null,
      mustChangePassword: true,
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockListBills).not.toHaveBeenCalled();
  });
});
