/**
 * Tests for POST /api/guard/guest-passes/check.
 * BB-1705, SG-02.
 *
 * @author Tawhid Bin Moslim
 */

import { POST } from './route';

import { databaseGuestPassGateStore } from '@/lib/adapters/guestPassGateAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { makeProfile } from '@/services/testFakes';
import { checkGuestPass } from '@/services/guestPassCheckService';

jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {},
}));

jest.mock('@/lib/adapters/guestPassGateAdapters', () => ({
  databaseGuestPassGateStore: jest.fn(() => ({})),
}));

jest.mock('@/services/guestPassCheckService', () => ({
  checkGuestPass: jest.fn(),
}));

function allowGuard(): void {
  jest.mocked(requireRole).mockResolvedValue({
    actor: makeProfile({
      id: 'guard-1',
      role: 'guard',
    }),
    scope: 'all',
  });
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/guard/guest-passes/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(checkGuestPass).mockResolvedValue({
    guestName: 'Rahim',
    flat: 'A-101',
    approvedGuestCount: 2,
    remainingGuestCount: 2,
    status: 'Active',
    checkInAllowed: true,
    reason: null,
    validFrom: null,
  } as Awaited<ReturnType<typeof checkGuestPass>>);
});

describe('POST /api/guard/guest-passes/check (BB-1705)', () => {
  it('allows a guard to check a six-digit pass code', async () => {
    allowGuard();

    const response = await POST(makeRequest({ code: '123456' }));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'runGate');
    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      guestName: 'Rahim',
      flat: 'A-101',
      approvedGuestCount: 2,
      remainingGuestCount: 2,
      status: 'Active',
      checkInAllowed: true,
      reason: null,
      validFrom: null,
    });

    expect(databaseGuestPassGateStore).toHaveBeenCalledTimes(1);
    expect(checkGuestPass).toHaveBeenCalledWith({ passes: expect.anything() }, '123456');
  });

  it('does not expose the resident phone number', async () => {
    allowGuard();

    const response = await POST(makeRequest({ code: '123456' }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).not.toHaveProperty('residentPhone');
    expect(result).not.toHaveProperty('phone');
  });

  it('rejects an unauthorised user', async () => {
    jest
      .mocked(requireRole)
      .mockRejectedValue(new AppError('FORBIDDEN', "You don't have access to this."));

    const response = await POST(makeRequest({ code: '123456' }));

    expect(response.status).toBe(403);
    expect(checkGuestPass).not.toHaveBeenCalled();
  });

  it('rejects a code that is not six digits', async () => {
    allowGuard();

    const response = await POST(makeRequest({ code: '12345' }));

    expect(response.status).toBe(400);
    expect(checkGuestPass).not.toHaveBeenCalled();
  });

  it('rejects a request with no code', async () => {
    allowGuard();

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(checkGuestPass).not.toHaveBeenCalled();
  });
});
