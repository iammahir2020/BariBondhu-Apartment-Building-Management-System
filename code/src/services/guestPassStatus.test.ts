/**
 * Tests for the guest pass status: each of the six states, the exact start and end times, cancellation, and a
 * Fully used pass after its end time (RES-03, SG-02, BR-11). Case IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import {
  ENTRY_GUEST_PASS_STATUSES,
  GUEST_PASS_STATUSES,
  LIVE_GUEST_PASS_STATUSES,
  allowsGuestEntry,
  guestPassStatusAt,
  isLiveGuestPassStatus,
  type GuestPassTiming,
} from '@/services/guestPassStatus';

/** A Dhaka time on 23 Nov 2026, as a Date. */
function dhaka(time: string, day = 23): Date {
  return new Date(`2026-11-${day}T${time}:00+06:00`);
}

/** A pass for 4 guests, 18:00 to 22:00 Dhaka time, nobody in yet, not cancelled. */
function pass(overrides: Partial<GuestPassTiming> = {}): GuestPassTiming {
  return {
    startsAt: dhaka('18:00'),
    endsAt: dhaka('22:00'),
    guestCount: 4,
    guestsUsed: 0,
    cancelledAt: null,
    ...overrides,
  };
}

describe('guestPassStatusAt', () => {
  it('is Scheduled before the start time (TC-R03-14)', () => {
    expect(guestPassStatusAt(pass(), dhaka('17:59'))).toBe('Scheduled');
  });

  it('is Active exactly at the start time with nobody checked in (TC-R03-15)', () => {
    expect(guestPassStatusAt(pass(), dhaka('18:00'))).toBe('Active');
  });

  it('is Active one minute before the end time with nobody checked in', () => {
    expect(guestPassStatusAt(pass(), dhaka('21:59'))).toBe('Active');
  });

  it.each([1, 2, 3])('is Partly used with %i of 4 guests in (TC-R03-16)', (guestsUsed) => {
    expect(guestPassStatusAt(pass({ guestsUsed }), dhaka('19:00'))).toBe('Partly used');
  });

  it('is Fully used with 4 of 4 guests in (TC-R03-17)', () => {
    expect(guestPassStatusAt(pass({ guestsUsed: 4 }), dhaka('19:00'))).toBe('Fully used');
  });

  it('counts more guests than the pass allows as Fully used, never as Partly used', () => {
    expect(guestPassStatusAt(pass({ guestsUsed: 5 }), dhaka('19:00'))).toBe('Fully used');
  });

  it('is Expired exactly at the end time and one minute after (TC-R03-18)', () => {
    expect(guestPassStatusAt(pass(), dhaka('22:00'))).toBe('Expired');
    expect(guestPassStatusAt(pass(), dhaka('22:01'))).toBe('Expired');
  });

  it('is Expired after the end time when only some guests came (TC-R03-18)', () => {
    expect(guestPassStatusAt(pass({ guestsUsed: 2 }), dhaka('23:00'))).toBe('Expired');
  });

  it('stays Fully used after the end time, since the state diagram has no way out of Fully used', () => {
    expect(guestPassStatusAt(pass({ guestsUsed: 4 }), dhaka('23:00'))).toBe('Fully used');
  });

  it('is Cancelled from the cancellation time on, before the start', () => {
    const cancelled = pass({ cancelledAt: dhaka('12:00') });
    expect(guestPassStatusAt(cancelled, dhaka('12:00'))).toBe('Cancelled');
    expect(guestPassStatusAt(cancelled, dhaka('18:30'))).toBe('Cancelled');
  });

  it('is Cancelled when cancelled while Partly used (TC-R03-19)', () => {
    const cancelled = pass({ guestsUsed: 2, cancelledAt: dhaka('19:30') });
    expect(guestPassStatusAt(cancelled, dhaka('19:30'))).toBe('Cancelled');
  });

  it('stays Cancelled after the end time instead of becoming Expired', () => {
    expect(guestPassStatusAt(pass({ cancelledAt: dhaka('19:00') }), dhaka('23:00'))).toBe(
      'Cancelled',
    );
  });

  it('gives the status the pass had before it was cancelled when asked about an earlier moment', () => {
    const cancelled = pass({ guestsUsed: 1, cancelledAt: dhaka('20:00') });
    expect(guestPassStatusAt(cancelled, dhaka('19:59'))).toBe('Partly used');
  });

  it('handles a pass that crosses midnight (TC-R03-08)', () => {
    const night = pass({ startsAt: dhaka('22:00'), endsAt: dhaka('02:00', 24) });
    expect(guestPassStatusAt(night, dhaka('23:30'))).toBe('Active');
    expect(guestPassStatusAt(night, dhaka('01:59', 24))).toBe('Active');
    expect(guestPassStatusAt(night, dhaka('02:00', 24))).toBe('Expired');
  });

  it('handles a pass for 1 guest and a pass for 20 guests (TC-R03-02)', () => {
    expect(guestPassStatusAt(pass({ guestCount: 1, guestsUsed: 1 }), dhaka('19:00'))).toBe(
      'Fully used',
    );
    expect(guestPassStatusAt(pass({ guestCount: 20, guestsUsed: 19 }), dhaka('19:00'))).toBe(
      'Partly used',
    );
  });

  it('only ever returns one of the six states from the state diagram', () => {
    const moments = [dhaka('17:00'), dhaka('18:00'), dhaka('20:00'), dhaka('22:00')];
    const passes = [
      pass(),
      pass({ guestsUsed: 2 }),
      pass({ guestsUsed: 4 }),
      pass({ cancelledAt: dhaka('19:00') }),
    ];
    for (const p of passes) {
      for (const at of moments) {
        expect(GUEST_PASS_STATUSES).toContain(guestPassStatusAt(p, at));
      }
    }
  });
});

describe('isLiveGuestPassStatus', () => {
  it.each(['Scheduled', 'Active', 'Partly used'] as const)(
    'counts %s as live: the code is taken and the pass can be cancelled (BR-11, TC-R03-11, TC-R03-19)',
    (status) => {
      expect(isLiveGuestPassStatus(status)).toBe(true);
    },
  );

  it.each(['Fully used', 'Cancelled', 'Expired'] as const)(
    'does not count %s as live: the code is free again and cancelling is refused (TC-R03-12, TC-R03-20)',
    (status) => {
      expect(isLiveGuestPassStatus(status)).toBe(false);
    },
  );

  it('lists exactly the three live states', () => {
    expect(LIVE_GUEST_PASS_STATUSES).toEqual(['Scheduled', 'Active', 'Partly used']);
  });
});

describe('allowsGuestEntry', () => {
  it.each(['Active', 'Partly used'] as const)('lets the guard check guests in on %s', (status) => {
    expect(allowsGuestEntry(status)).toBe(true);
  });

  it.each(['Scheduled', 'Fully used', 'Cancelled', 'Expired'] as const)(
    'refuses entry on %s (SG-02)',
    (status) => {
      expect(allowsGuestEntry(status)).toBe(false);
    },
  );

  it('lists exactly the two entry states', () => {
    expect(ENTRY_GUEST_PASS_STATUSES).toEqual(['Active', 'Partly used']);
  });
});
