/**
 * Tests for manager monthly bill generation API.
 *
 * BB-0508, BM-03, NFR-06.
 *
 * @author Jannatul Ferdus Nishi
 */

import { POST } from './route';
import type { Profile } from '@/models';
import { makeProfile } from '@/services/testFakes';

let mockSignedIn: Profile | null = null;

const mockGenerateBills = jest.fn();

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
    listBills: jest.fn(),
  }),
}));

jest.mock('@/services/generateBillsWithCarryForward', () => ({
  generateBillsWithCarryForward: (...args: unknown[]) => mockGenerateBills(...args),
}));

function request(
  body: unknown = {
    billingMonth: '2026-12-01',
    dueDate: '2026-12-20',
  },
): Request {
  return new Request('http://localhost:3000/api/manager/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function signInManager() {
  mockSignedIn = makeProfile({
    role: 'manager',
    occupancyId: null,
  });
}

describe('POST /api/manager/bills (BB-0508)', () => {
  beforeEach(() => {
    mockSignedIn = null;
    mockGenerateBills.mockReset();

    mockGenerateBills.mockResolvedValue({
      billingMonth: '2026-12-01',
      createdCount: 2,
      skippedCount: 0,
      bills: [],
    });
  });

  it('allows the manager to generate bills', async () => {
    signInManager();

    const response = await POST(request());

    expect(response.status).toBe(201);

    await expect(response.json()).resolves.toEqual({
      billingMonth: '2026-12-01',
      createdCount: 2,
      skippedCount: 0,
      bills: [],
    });

    expect(mockGenerateBills).toHaveBeenCalledWith(
      expect.anything(),
      {
        billingMonth: '2026-12-01',
        dueDate: '2026-12-20',
      },
      mockSignedIn!.id,
    );
  });

  it('rejects a signed-out user', async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockGenerateBills).not.toHaveBeenCalled();
  });

  it.each(['resident', 'guard', 'committee', 'maintenance', 'admin'] as const)(
    'rejects a %s user',
    async (role) => {
      mockSignedIn = makeProfile({
        role,
        occupancyId: null,
      });

      const response = await POST(request());

      expect(response.status).toBe(403);
      expect(mockGenerateBills).not.toHaveBeenCalled();
    },
  );

  it('rejects a manager who must change password', async () => {
    mockSignedIn = makeProfile({
      role: 'manager',
      mustChangePassword: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockGenerateBills).not.toHaveBeenCalled();
  });

  it('rejects a missing billing month', async () => {
    signInManager();

    const response = await POST(
      request({
        dueDate: '2026-12-20',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGenerateBills).not.toHaveBeenCalled();
  });

  it('rejects a missing due date', async () => {
    signInManager();

    const response = await POST(
      request({
        billingMonth: '2026-12-01',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGenerateBills).not.toHaveBeenCalled();
  });

  it('uses the authenticated manager ID', async () => {
    signInManager();

    await POST(
      request({
        billingMonth: '2026-12-01',
        dueDate: '2026-12-20',
        actorId: 'someone-else',
      }),
    );

    expect(mockGenerateBills).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      mockSignedIn!.id,
    );
  });

  it('returns 409 for an existing billing month', async () => {
    signInManager();

    const { AppError } = jest.requireActual('@/lib/errors');

    mockGenerateBills.mockRejectedValueOnce(
      new AppError('CONFLICT', 'Bills for this month already exist'),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
  });
});
