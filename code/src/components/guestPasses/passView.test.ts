/**
 * Tests for how the guest pass screens show a pass: Dhaka times, the split code, the people count and the Share
 * message.
 *
 * @author Mahir Al Kamal
 */
import type { GuestPassView } from '@/lib/guestPassResponse';
import {
  canCancelPass,
  formatPassCode,
  formatPassMoment,
  formatPassWindow,
  passShareText,
  peopleText,
} from '@/components/guestPasses/passView';

const PASS: GuestPassView = {
  id: 'pass-1',
  guestName: 'Rafiq Hasan',
  guestCount: 4,
  guestsUsed: 0,
  startsAt: '2026-11-25T11:00:00.000Z',
  endsAt: '2026-11-25T17:00:00.000Z',
  code: '482913',
  status: 'Scheduled',
  cancelledAt: null,
};

describe('formatPassWindow', () => {
  it('shows the day once for a window within one Dhaka day', () => {
    expect(formatPassWindow(PASS.startsAt, PASS.endsAt)).toBe('25 Nov, 5:00 pm to 11:00 pm');
  });

  it('shows both days for a window past midnight in Dhaka (TC-R03-08)', () => {
    expect(formatPassWindow('2026-11-25T16:00:00.000Z', '2026-11-25T20:00:00.000Z')).toBe(
      '25 Nov, 10:00 pm to 26 Nov, 2:00 am',
    );
  });
});

describe('formatPassMoment', () => {
  it('shows a day and time in Dhaka', () => {
    expect(formatPassMoment('2026-11-25T17:00:00.000Z')).toBe('25 Nov, 11:00 pm');
  });
});

describe('formatPassCode', () => {
  it('splits the code in two, keeping leading zeros (TC-R03-10)', () => {
    expect(formatPassCode('004271')).toBe('004 271');
  });
});

describe('peopleText', () => {
  it.each([
    [1, '1 person'],
    [2, '2 people'],
    [20, '20 people'],
  ])('says %i as "%s"', (count, text) => {
    expect(peopleText(count)).toBe(text);
  });
});

describe('canCancelPass', () => {
  it.each(['Scheduled', 'Active', 'Partly used'] as const)('allows cancelling a %s pass', (s) => {
    expect(canCancelPass(s)).toBe(true);
  });

  it.each(['Fully used', 'Cancelled', 'Expired'] as const)('does not offer it for %s', (s) => {
    expect(canCancelPass(s)).toBe(false);
  });
});

describe('passShareText', () => {
  it('says who, how many, when and the code', () => {
    expect(passShareText(PASS)).toBe(
      'Guest pass for Rafiq Hasan, 4 people, 25 Nov, 5:00 pm to 11:00 pm. Show code 482 913 to the guard at the gate.',
    );
  });
});
