/**
 * Tests for POST /api/manager/shifts.
 * BB-1906, BM-09, NFR-06.
 *
 * @author Tawhid Bin Moslim
 */

import { POST } from './route';

import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import type { Shift } from '@/models';
import { makeProfile } from '@/services/testFakes';
import { planShift } from '@/services/shiftService';

jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {},
}));

jest.mock('@/lib/adapters/shiftAdapters', () => ({
  databaseShiftStore: jest.fn(() => ({})),
}));

jest.mock('@/services/shiftService', () => ({
  planShift: jest.fn(),
}));

const SAVED_SHIFT: Shift = {
  id: '00000000-0000-4000-8000-000000000001',
  guardId: 'guard-1',
  startsAt: new Date('2026-11-27T08:00:00Z'),
  endsAt: new Date('2026-11-27T16:00:00Z'),
  status: 'Planned',
};

function request(
  body: unknown = {
    guardId: 'guard-1',
    startsAt: '2026-11-27T08:00:00.000Z',
    endsAt: '2026-11-27T16:00:00.000Z',
  },
): Request {
  return new Request('http://localhost:3000/api/manager/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function allowManager(): void {
  jest.mocked(requireRole).mockResolvedValue({
    actor: makeProfile({ role: 'manager' }),
    scope: 'all',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(planShift).mockResolvedValue(SAVED_SHIFT);
});

describe('POST /api/manager/shifts (BB-1906)', () => {
  it('allows a manager to plan a shift', async () => {
    allowManager();

    const response = await POST(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'planShifts');
    expect(response.status).toBe(201);

    await expect(response.json()).resolves.toEqual({
      shift: JSON.parse(JSON.stringify(SAVED_SHIFT)),
    });

    expect(planShift).toHaveBeenCalledWith(
      expect.objectContaining({
        shifts: expect.anything(),
      }),
      {
        guardId: 'guard-1',
        startsAt: new Date('2026-11-27T08:00:00.000Z'),
        endsAt: new Date('2026-11-27T16:00:00.000Z'),
      },
    );
  });

  it('rejects an unauthorised user', async () => {
    jest
      .mocked(requireRole)
      .mockRejectedValue(new AppError('FORBIDDEN', "You don't have access to this."));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(planShift).not.toHaveBeenCalled();
  });

  it('returns 400 when the shift times are invalid', async () => {
    allowManager();

    jest
      .mocked(planShift)
      .mockRejectedValueOnce(new AppError('BAD_REQUEST', 'Check the shift times'));

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'Check the shift times',
      },
    });
  });

  it('returns 409 when the guard already has an overlapping shift', async () => {
    allowManager();

    jest
      .mocked(planShift)
      .mockRejectedValueOnce(new AppError('CONFLICT', 'This guard already has a shift then'));

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'This guard already has a shift then',
      },
    });
  });
});
