/**
 * Tests for POST /api/guard/guest-passes/entry.
 * BB-1705, SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import { POST } from './route';

import { databaseGuestPassGateStore } from '@/lib/adapters/guestPassGateAdapters';
import { databaseNotifier } from '@/lib/adapters/notificationAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { makeProfile } from '@/services/testFakes';
import { recordGuestEntry } from '@/services/guestPassEntryService';

jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {},
}));

jest.mock('@/lib/adapters/guestPassGateAdapters', () => ({
  databaseGuestPassGateStore: jest.fn(() => ({})),
}));

jest.mock('@/lib/adapters/notificationAdapters', () => ({
  databaseNotifier: jest.fn(() => jest.fn()),
}));

jest.mock('@/services/guestPassEntryService', () => ({
  recordGuestEntry: jest.fn(),
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
  return new Request('http://localhost:3000/api/guard/guest-passes/entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(recordGuestEntry).mockResolvedValue({
    visit: {
      id: 'visit-1',
      guestPassId: 'pass-1',
      guestsIn: 2,
      enteredAt: new Date('2026-11-27T10:00:00.000Z'),
      guardId: 'guard-1',
      enteredLater: false,
      createdAt: new Date('2026-11-27T10:00:00.000Z'),
    },
    remainingGuestCount: 1,
  });
});

describe('POST /api/guard/guest-passes/entry (BB-1705)', () => {
  it('allows a guard to record guest entry', async () => {
    allowGuard();

    const response = await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 2,
      }),
    );

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'runGate');
    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toMatchObject({
      visit: {
        id: 'visit-1',
        guestPassId: 'pass-1',
        guestsIn: 2,
        guardId: 'guard-1',
      },
      remainingGuestCount: 1,
    });

    expect(databaseGuestPassGateStore).toHaveBeenCalledTimes(1);
    expect(databaseNotifier).toHaveBeenCalledTimes(1);
    expect(recordGuestEntry).toHaveBeenCalledWith(
      {
        store: expect.anything(),
        notify: expect.any(Function),
      },
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 2,
        enteredLater: false,
      },
    );
  });

  it('uses the authenticated guard ID instead of a supplied guard ID', async () => {
    allowGuard();

    await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 1,
        guardId: 'guard-2',
      }),
    );

    expect(recordGuestEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        guardId: 'guard-1',
      }),
    );
  });

  it('accepts the actual entry time for a paper-register entry', async () => {
    allowGuard();

    await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 1,
        enteredLater: true,
        enteredAt: '2026-11-27T08:30:00.000Z',
      }),
    );

    expect(recordGuestEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enteredLater: true,
        enteredAt: new Date('2026-11-27T08:30:00.000Z'),
      }),
    );
  });

  it('rejects an unauthorised user', async () => {
    jest
      .mocked(requireRole)
      .mockRejectedValue(new AppError('FORBIDDEN', "You don't have access to this."));

    const response = await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(recordGuestEntry).not.toHaveBeenCalled();
  });

  it('rejects a missing pass ID', async () => {
    allowGuard();

    const response = await POST(makeRequest({ guestsIn: 1 }));

    expect(response.status).toBe(400);
    expect(recordGuestEntry).not.toHaveBeenCalled();
  });

  it('rejects a non-integer guest count', async () => {
    allowGuard();

    const response = await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 1.5,
      }),
    );

    expect(response.status).toBe(400);
    expect(recordGuestEntry).not.toHaveBeenCalled();
  });

  it('rejects an invalid entry time', async () => {
    allowGuard();

    const response = await POST(
      makeRequest({
        passId: 'pass-1',
        guestsIn: 1,
        enteredLater: true,
        enteredAt: 'not-a-date',
      }),
    );

    expect(response.status).toBe(400);
    expect(recordGuestEntry).not.toHaveBeenCalled();
  });
});
