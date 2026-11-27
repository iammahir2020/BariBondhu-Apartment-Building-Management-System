/**
 * Tests for GET /api/guard/shifts/mine.
 * BB-1906, SG-05, NFR-06.
 *
 * @author Tawhid Bin Moslim
 */

import { GET } from './route';

import { databaseShiftStore } from '@/lib/adapters/shiftAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { makeProfile } from '@/services/testFakes';
import { getMyDutyList } from '@/services/shiftDutyService';

jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {},
}));

jest.mock('@/lib/adapters/shiftAdapters', () => ({
  databaseShiftStore: jest.fn(() => ({})),
}));

jest.mock('@/services/shiftDutyService', () => ({
  getMyDutyList: jest.fn(),
}));

function allowGuard(): void {
  jest.mocked(requireRole).mockResolvedValue({
    actor: makeProfile({
      id: 'guard-1',
      role: 'guard',
    }),
    scope: 'own',
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(getMyDutyList).mockResolvedValue({
    shifts: [],
    noShiftToday: true,
  });
});

describe('GET /api/guard/shifts/mine (BB-1906)', () => {
  it('allows a guard to view their own shifts', async () => {
    allowGuard();

    const response = await GET(new Request('http://localhost:3000/api/guard/shifts/mine'));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewOwnShift');
    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      shifts: [],
      noShiftToday: true,
    });

    expect(databaseShiftStore).toHaveBeenCalledTimes(1);
    expect(getMyDutyList).toHaveBeenCalledWith(
      expect.objectContaining({
        shifts: expect.anything(),
      }),
      'guard-1',
      expect.any(Date),
    );
  });

  it('does not allow a guard to request another guard ID', async () => {
    allowGuard();

    const response = await GET(
      new Request('http://localhost:3000/api/guard/shifts/mine?guardId=guard-2'),
    );

    expect(response.status).toBe(200);
    expect(getMyDutyList).toHaveBeenCalledWith(expect.anything(), 'guard-1', expect.any(Date));
  });

  it('rejects an unauthorised user', async () => {
    jest
      .mocked(requireRole)
      .mockRejectedValue(new AppError('FORBIDDEN', "You don't have access to this."));

    const response = await GET(new Request('http://localhost:3000/api/guard/shifts/mine'));

    expect(response.status).toBe(403);
    expect(getMyDutyList).not.toHaveBeenCalled();
  });
});
