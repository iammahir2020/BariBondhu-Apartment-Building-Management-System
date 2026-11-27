/**
 * Tests for recording guest entry (SG-03).
 * Case IDs are from docs/test-cases.md.
 */

import { AppError } from '@/lib/errors';
import { recordGuestEntry, type GuestPassEntryRecord } from '@/services/guestPassEntryService';

const NOW = new Date('2026-11-23T19:00:00+06:00');
const ENTRY_TIME = new Date('2026-11-23T18:45:00+06:00');

const PASS: GuestPassEntryRecord = {
  id: 'pass-1',
  createdById: 'resident-1',
  guestCount: 4,
  guestsUsed: 1,
  startsAt: new Date('2026-11-23T18:00:00+06:00'),
  endsAt: new Date('2026-11-23T22:00:00+06:00'),
  cancelledAt: null,
};

function makeDeps(
  overrides: {
    pass?: typeof PASS | null;
    notify?: jest.Mock;
  } = {},
) {
  const pass = overrides.pass === undefined ? { ...PASS } : overrides.pass;
  const notify = overrides.notify ?? jest.fn().mockResolvedValue(undefined);

  const store = {
    findById: jest.fn().mockResolvedValue(pass),
    recordEntry: jest.fn().mockImplementation(async (entry) => ({
      id: 'visit-1',
      ...entry,
    })),
  };

  return { deps: { store, notify }, store, notify };
}

describe('recordGuestEntry', () => {
  it('records an entry and updates the pass allowance (TC-SG03-01)', async () => {
    const { deps, store, notify } = makeDeps();

    const result = await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 2,
      },
      NOW,
    );

    expect(store.findById).toHaveBeenCalledWith('pass-1');
    expect(store.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        passId: 'pass-1',
        expectedGuestsUsed: 1,
        guestsIn: 2,
        enteredAt: NOW,
        guardId: 'guard-1',
        enteredLater: false,
      }),
    );
    expect(result.remainingGuestCount).toBe(1);
    expect(notify).toHaveBeenCalledWith({
      recipientId: 'resident-1',
      text: '2 guests have arrived for your guest pass.',
      link: '/resident/guest-passes',
    });
  });

  it('records the actual time from the paper register (TC-SG03-05)', async () => {
    const { deps, store } = makeDeps();

    await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 1,
        enteredAt: ENTRY_TIME,
        enteredLater: true,
      },
      NOW,
    );

    expect(store.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        enteredAt: ENTRY_TIME,
        enteredLater: true,
        guestsIn: 1,
      }),
    );
  });

  it('allows exactly the remaining number of guests (TC-SG03-02)', async () => {
    const { deps, store } = makeDeps();

    const result = await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 3,
      },
      NOW,
    );

    expect(store.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedGuestsUsed: 1,
        guestsIn: 3,
      }),
    );
    expect(result.remainingGuestCount).toBe(0);
  });

  it('rejects more guests than remain and reports the remaining count (TC-SG03-03)', async () => {
    const { deps, store, notify } = makeDeps();

    await expect(
      recordGuestEntry(
        deps,
        {
          passId: 'pass-1',
          guardId: 'guard-1',
          guestsIn: 4,
        },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      details: { remainingGuestCount: 3 },
    });

    expect(store.recordEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { endsAt: new Date('2026-11-23T18:59:00+06:00') }],
    ['cancelled', { cancelledAt: new Date('2026-11-23T18:30:00+06:00') }],
    ['scheduled', { startsAt: new Date('2026-11-23T20:00:00+06:00') }],
  ])('rejects a %s pass', async (_name, changes) => {
    const { deps, store, notify } = makeDeps({
      pass: { ...PASS, ...changes },
    });

    await expect(
      recordGuestEntry(
        deps,
        {
          passId: 'pass-1',
          guardId: 'guard-1',
          guestsIn: 1,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(AppError);

    expect(store.recordEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('validates a paper-register entry at its actual entry time', async () => {
    const { deps, store } = makeDeps({
      pass: {
        ...PASS,
        endsAt: new Date('2026-11-23T19:00:00+06:00'),
      },
    });

    await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 1,
        enteredAt: ENTRY_TIME,
        enteredLater: true,
      },
      NOW,
    );

    expect(store.recordEntry).toHaveBeenCalled();
  });

  it('rejects a supplied entry time for an ordinary check-in', async () => {
    const { deps, store, notify } = makeDeps();

    await expect(
      recordGuestEntry(
        deps,
        {
          passId: 'pass-1',
          guardId: 'guard-1',
          guestsIn: 1,
          enteredAt: ENTRY_TIME,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(store.recordEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects an unknown pass', async () => {
    const { deps, store, notify } = makeDeps({ pass: null });

    await expect(
      recordGuestEntry(
        deps,
        {
          passId: 'missing-pass',
          guardId: 'guard-1',
          guestsIn: 1,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(store.recordEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies the resident after a successful entry with the arrived guest count (TC-SG03-06)', async () => {
    const { deps, store, notify } = makeDeps();

    await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 2,
      },
      NOW,
    );

    expect(store.recordEntry.mock.invocationCallOrder[0]!).toBeLessThan(
      notify.mock.invocationCallOrder[0]!,
    );
    expect(notify).toHaveBeenCalledWith({
      recipientId: 'resident-1',
      text: '2 guests have arrived for your guest pass.',
      link: '/resident/guest-passes',
    });
  });

  it('does not undo a saved entry if notification fails', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('Notification unavailable'));
    const { deps, store } = makeDeps({ notify });

    const result = await recordGuestEntry(
      deps,
      {
        passId: 'pass-1',
        guardId: 'guard-1',
        guestsIn: 1,
      },
      NOW,
    );

    expect(store.recordEntry).toHaveBeenCalled();
    expect(result.remainingGuestCount).toBe(2);
  });

  it('rejects zero or negative guest counts', async () => {
    const { deps, store } = makeDeps();

    await expect(
      recordGuestEntry(
        deps,
        {
          passId: 'pass-1',
          guardId: 'guard-1',
          guestsIn: 0,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(AppError);

    expect(store.recordEntry).not.toHaveBeenCalled();
  });
});
