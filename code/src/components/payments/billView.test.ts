/**
 * Tests for how Dues and the Receipt show a bill.
 *
 * @author Mahir Al Kamal
 */
import type { MyBillView } from '@/services/myBillsService';
import {
  BILL_STATUS_BADGE,
  currentBill,
  dueCountdown,
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

const BILL: MyBillView = {
  id: 'bill-nov',
  billingMonth: '2026-11-01',
  dueDate: '2026-11-20',
  totalPoisha: 485_000,
  status: 'Unpaid',
  lines: [],
  canPay: true,
  paymentProblem: null,
  receiptNumber: null,
};

describe('currentBill', () => {
  it('picks the newest bill that still needs paying', () => {
    const october = { ...BILL, id: 'bill-oct', status: 'Unpaid' as const };
    expect(currentBill([BILL, october])?.id).toBe('bill-nov');
  });

  it('skips Paid and Carried forward bills', () => {
    const paid = { ...BILL, id: 'paid', status: 'Paid' as const };
    const carried = { ...BILL, id: 'carried', status: 'Carried forward' as const };
    const pending = { ...BILL, id: 'pending', status: 'Payment pending' as const };
    expect(currentBill([paid, carried, pending])?.id).toBe('pending');
  });

  it('returns null when every bill is settled, or there are none', () => {
    expect(currentBill([{ ...BILL, status: 'Paid' }])).toBeNull();
    expect(currentBill([])).toBeNull();
  });
});

describe('dueCountdown', () => {
  it('counts the days left in Dhaka', () => {
    expect(dueCountdown('2026-11-20', new Date('2026-11-15T06:00:00Z'))).toBe('5 days left');
  });

  it('says 1 day left the day before', () => {
    expect(dueCountdown('2026-11-20', new Date('2026-11-19T06:00:00Z'))).toBe('1 day left');
  });

  it('says due today on the due day, even late in the Dhaka evening', () => {
    expect(dueCountdown('2026-11-20', new Date('2026-11-20T17:30:00Z'))).toBe('due today');
  });

  it('moves to the next Dhaka day at midnight, not at UTC midnight', () => {
    // 19 Nov 18:30 UTC is already 20 Nov 00:30 in Dhaka.
    expect(dueCountdown('2026-11-20', new Date('2026-11-19T18:30:00Z'))).toBe('due today');
  });

  it('counts the days late once the due date has passed', () => {
    expect(dueCountdown('2026-11-20', new Date('2026-11-21T06:00:00Z'))).toBe('1 day late');
    expect(dueCountdown('2026-11-20', new Date('2026-11-25T06:00:00Z'))).toBe('5 days late');
  });
});
