/**
 * Tests for how Dues and the Receipt show a bill.
 *
 * @author Mahir Al Kamal
 */
import {
  BILL_STATUS_BADGE,
  formatBillDay,
  formatBillMoment,
  formatBillMonth,
  lineLabel,
} from './billView';

describe('lineLabel', () => {
  it.each([
    ['service', null, 'Service charge'],
    ['generator', null, 'Generator'],
    ['water', null, 'Water'],
    ['carried_forward', null, 'Carried forward'],
    ['credit', null, 'Credit'],
    ['adjustment', 'Water meter misread', 'Adjustment: Water meter misread'],
    ['adjustment', null, 'Adjustment'],
  ] as const)('names a %s line (%s) as %s', (type, description, label) => {
    expect(lineLabel({ type, amountPoisha: 100, description })).toBe(label);
  });

  it('keeps a description on other lines out of the name', () => {
    expect(lineLabel({ type: 'water', amountPoisha: 100, description: 'note' })).toBe('Water');
  });
});

describe('formatBillMonth', () => {
  it.each([
    ['2026-11-01', 'November 2026'],
    ['2027-01-01', 'January 2027'],
  ])('shows %s as %s', (month, shown) => {
    expect(formatBillMonth(month)).toBe(shown);
  });
});

describe('formatBillDay', () => {
  it.each([
    ['2026-11-20', '20 Nov 2026'],
    ['2026-12-01', '1 Dec 2026'],
  ])('shows %s as %s', (day, shown) => {
    expect(formatBillDay(day)).toBe(shown);
  });
});

describe('formatBillMoment', () => {
  it('shows a moment in Dhaka time', () => {
    expect(formatBillMoment('2026-11-25T04:02:00.000Z')).toBe('25 Nov 2026, 10:02 am');
  });

  it('moves to the next day after 6 pm UTC', () => {
    expect(formatBillMoment(new Date('2026-11-25T18:30:00Z'))).toBe('26 Nov 2026, 12:30 am');
  });
});

describe('BILL_STATUS_BADGE', () => {
  it('colours each status as the prototype does', () => {
    expect(BILL_STATUS_BADGE.Unpaid.variant).toBe('warn');
    expect(BILL_STATUS_BADGE['Payment pending'].variant).toBe('info');
    expect(BILL_STATUS_BADGE['Awaiting verification'].variant).toBe('info');
    expect(BILL_STATUS_BADGE.Paid.variant).toBe('ok');
    expect(BILL_STATUS_BADGE['Carried forward'].variant).toBe('mute');
  });
});
