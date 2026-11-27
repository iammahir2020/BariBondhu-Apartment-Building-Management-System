/**
 * Tests for guard-side guest pass checking (SG-02).
 * Case IDs are from docs/test-cases.md.
 */

import { checkGuestPass, type GuestPassCheckRecord } from '@/services/guestPassCheckService';

const NOW = new Date('2026-11-23T19:00:00+06:00');

function makePass(overrides: Partial<GuestPassCheckRecord> = {}): GuestPassCheckRecord {
  return {
    id: 'pass-1',
    guestName: 'Rahim',
    blockName: 'A',
    flatNumber: '101',
    guestCount: 4,
    guestsUsed: 1,
    startsAt: new Date('2026-11-23T18:00:00+06:00'),
    endsAt: new Date('2026-11-23T22:00:00+06:00'),
    cancelledAt: null,
    createdAt: new Date('2026-11-23T10:00:00+06:00'),
    ...overrides,
  };
}

function deps(records: GuestPassCheckRecord[] = []) {
  return {
    passes: {
      async passesWithCode(code: string) {
        return code === '123456' ? records : [];
      },
    },
  };
}

describe('checkGuestPass', () => {
  it('shows guest name, flat, approved count and remaining count for a valid pass (TC-SG02-01)', async () => {
    const result = await checkGuestPass(deps([makePass()]), '123456', NOW);

    expect(result).toEqual({
      passId: 'pass-1',
      guestName: 'Rahim',
      flat: 'A-101',
      approvedGuestCount: 4,
      remainingGuestCount: 3,
      status: 'Partly used',
      checkInAllowed: true,
      reason: null,
      validFrom: null,
    });
  });

  it('refuses an expired pass (TC-SG02-02)', async () => {
    const result = await checkGuestPass(
      deps([makePass({ endsAt: new Date('2026-11-23T18:59:00+06:00') })]),
      '123456',
      NOW,
    );

    expect(result.status).toBe('Expired');
    expect(result.reason).toBe('Expired');
    expect(result.checkInAllowed).toBe(false);
  });

  it('refuses a cancelled pass (TC-SG02-03)', async () => {
    const result = await checkGuestPass(
      deps([makePass({ cancelledAt: new Date('2026-11-23T18:30:00+06:00') })]),
      '123456',
      NOW,
    );

    expect(result.status).toBe('Cancelled');
    expect(result.reason).toBe('Cancelled');
    expect(result.checkInAllowed).toBe(false);
  });

  it('shows the valid-from time for a scheduled pass (TC-SG02-04)', async () => {
    const startsAt = new Date('2026-11-23T20:00:00+06:00');
    const result = await checkGuestPass(deps([makePass({ startsAt })]), '123456', NOW);

    expect(result.status).toBe('Scheduled');
    expect(result.reason).toBe('Valid from');
    expect(result.validFrom).toEqual(startsAt);
    expect(result.checkInAllowed).toBe(false);
  });

  it('reports an unknown code with the exact message (TC-SG02-05)', async () => {
    await expect(checkGuestPass(deps(), '999999', NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No pass with this code',
    });
  });

  it('refuses a fully used pass (TC-SG02-06)', async () => {
    const result = await checkGuestPass(deps([makePass({ guestsUsed: 4 })]), '123456', NOW);

    expect(result.status).toBe('Fully used');
    expect(result.reason).toBe('Fully used');
    expect(result.remainingGuestCount).toBe(0);
    expect(result.checkInAllowed).toBe(false);
  });

  it('does not include the resident phone number in the result (TC-SG02-07)', async () => {
    const result = await checkGuestPass(deps([makePass()]), '123456', NOW);

    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('residentPhone');
    expect(result).not.toHaveProperty('createdByPhone');
  });

  it('prefers a live pass when an old pass has reused its code', async () => {
    const oldPass = makePass({
      id: 'old-pass',
      guestName: 'Old guest',
      endsAt: new Date('2026-11-23T18:00:00+06:00'),
      createdAt: new Date('2026-11-22T10:00:00+06:00'),
    });
    const newPass = makePass({
      id: 'new-pass',
      guestName: 'New guest',
      createdAt: new Date('2026-11-23T10:00:00+06:00'),
    });

    const result = await checkGuestPass(deps([oldPass, newPass]), '123456', NOW);

    expect(result.guestName).toBe('New guest');
    expect(result.passId).toBe('new-pass');
    expect(result.status).toBe('Partly used');
  });
});
