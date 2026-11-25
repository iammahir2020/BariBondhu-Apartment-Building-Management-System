/**
 * Tests for what the manager's home shows: the "Needs you now" items and the lines under the totals.
 *
 * @author Mahir Al Kamal
 */
import type { ManagerHomeSummary } from '@/services/managerHomeService';
import { billsTotal, managerNeeds, MANAGER_PAGES, plural, ticketsLine } from './managerHomeView';

function summary(overrides: Partial<ManagerHomeSummary> = {}): ManagerHomeSummary {
  return {
    bills: { month: '2026-11-01', billed: 12, paid: 7, billedPoisha: 5820000, paidPoisha: 3395000 },
    tickets: { open: 0, lateUnassigned: 0, overdue: 0, urgent: 0 },
    waitingExpenses: { count: 0, totalPoisha: 0 },
    flaggedOverpayments: { count: 0, totalPoisha: 0 },
    ...overrides,
  };
}

describe('plural', () => {
  it('uses the singular for one and the plural otherwise (boundary)', () => {
    expect(plural(1, 'ticket')).toBe('1 ticket');
    expect(plural(0, 'ticket')).toBe('0 tickets');
    expect(plural(2, 'ticket')).toBe('2 tickets');
  });
});

describe('managerNeeds', () => {
  it('is empty when nothing needs the manager (boundary)', () => {
    expect(managerNeeds(summary())).toEqual([]);
  });

  it('lists late tickets first, then overdue, then overpayments (normal)', () => {
    const needs = managerNeeds(
      summary({
        tickets: { open: 5, lateUnassigned: 2, overdue: 1, urgent: 1 },
        flaggedOverpayments: { count: 1, totalPoisha: 485000 },
      }),
    );
    expect(needs.map((need) => need.title)).toEqual([
      '2 late tickets, nobody assigned',
      '1 overdue ticket',
      '1 overpayment to refund',
    ]);
    expect(needs[0]).toMatchObject({ tone: 'bad', detail: '1 urgent ticket open' });
    expect(needs[2]?.detail).toBe('৳4,850.00 paid twice, to return outside the app');
  });

  it('explains the late limit when no ticket is urgent (BM-06)', () => {
    const [late] = managerNeeds(
      summary({ tickets: { open: 1, lateUnassigned: 1, overdue: 0, urgent: 0 } }),
    );
    expect(late?.detail).toBe('Waiting over 24 hours (1 hour if urgent)');
  });

  it('links only to pages that exist', () => {
    const needs = managerNeeds(
      summary({ tickets: { open: 1, lateUnassigned: 1, overdue: 0, urgent: 0 } }),
    );
    expect(needs[0]?.href).toBe(MANAGER_PAGES.tickets);
  });
});

describe('billsTotal', () => {
  it('shows what is paid for the newest month (normal)', () => {
    expect(billsTotal(summary())).toEqual({
      label: 'Paid for November',
      value: '৳33,950.00',
      line: '7 of 12 bills paid · ৳58,200.00 billed',
    });
  });

  it('says so when no bills exist yet (boundary)', () => {
    expect(
      billsTotal(
        summary({ bills: { month: null, billed: 0, paid: 0, billedPoisha: 0, paidPoisha: 0 } }),
      ),
    ).toEqual({ label: 'Bills', value: '—', line: 'No bills made yet' });
  });
});

describe('ticketsLine', () => {
  it('names the overdue count, or says none (normal, boundary)', () => {
    expect(
      ticketsLine(summary({ tickets: { open: 3, lateUnassigned: 0, overdue: 2, urgent: 0 } })),
    ).toBe('2 overdue');
    expect(ticketsLine(summary())).toBe('None overdue');
  });
});
