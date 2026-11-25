/**
 * Tests for the manager's home counts: the newest month's bills, open, late and overdue tickets (BM-06), waiting
 * expenses and flagged overpayments.
 *
 * @author Mahir Al Kamal
 */
import {
  countMoney,
  getManagerHomeSummary,
  isLateUnassigned,
  isOverdue,
  summarizeBills,
  summarizeTickets,
  type HomeTicket,
  type ManagerHomeStore,
} from './managerHomeService';

/** 26 Nov 2026, 3 pm in Dhaka. */
const NOW = new Date('2026-11-26T09:00:00Z');
const HOUR = 60 * 60 * 1000;

function ticket(overrides: Partial<HomeTicket> = {}): HomeTicket {
  return {
    status: 'Reported',
    priority: 'Normal',
    assigneeId: null,
    dueDate: null,
    createdAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  };
}

describe('summarizeBills', () => {
  it('counts the month, the bills and the Paid ones with their totals (normal)', () => {
    const summary = summarizeBills([
      { billingMonth: '2026-11-01', totalPoisha: 485000, status: 'Paid' },
      { billingMonth: '2026-11-01', totalPoisha: 485000, status: 'Unpaid' },
      { billingMonth: '2026-11-01', totalPoisha: 300000, status: 'Payment pending' },
    ]);
    expect(summary).toEqual({
      month: '2026-11-01',
      billed: 3,
      paid: 1,
      billedPoisha: 1270000,
      paidPoisha: 485000,
    });
  });

  it('leaves out a Carried forward bill, whose amount is on a newer bill (BR-05)', () => {
    const summary = summarizeBills([
      { billingMonth: '2026-11-01', totalPoisha: 485000, status: 'Carried forward' },
      { billingMonth: '2026-11-01', totalPoisha: 100000, status: 'Paid' },
    ]);
    expect(summary).toMatchObject({ billed: 1, paid: 1, billedPoisha: 100000 });
  });

  it('has no month and zeros when no bills exist yet (boundary)', () => {
    expect(summarizeBills([])).toEqual({
      month: null,
      billed: 0,
      paid: 0,
      billedPoisha: 0,
      paidPoisha: 0,
    });
  });
});

describe('isLateUnassigned (BM-06)', () => {
  it('is late after 24 hours with nobody assigned (boundary)', () => {
    expect(isLateUnassigned(ticket({ createdAt: new Date(NOW.getTime() - 24 * HOUR) }), NOW)).toBe(
      false,
    );
    expect(
      isLateUnassigned(ticket({ createdAt: new Date(NOW.getTime() - 24 * HOUR - 1) }), NOW),
    ).toBe(true);
  });

  it('is late after 1 hour when Urgent (boundary)', () => {
    const urgent = { priority: 'Urgent' as const };
    expect(
      isLateUnassigned(ticket({ ...urgent, createdAt: new Date(NOW.getTime() - HOUR) }), NOW),
    ).toBe(false);
    expect(
      isLateUnassigned(ticket({ ...urgent, createdAt: new Date(NOW.getTime() - HOUR - 1) }), NOW),
    ).toBe(true);
  });

  it('is not late once someone is assigned, however old', () => {
    const old = new Date(NOW.getTime() - 72 * HOUR);
    expect(isLateUnassigned(ticket({ assigneeId: 'worker-1', createdAt: old }), NOW)).toBe(false);
    expect(
      isLateUnassigned(ticket({ status: 'Assigned', assigneeId: 'worker-1', createdAt: old }), NOW),
    ).toBe(false);
  });
});

describe('isOverdue', () => {
  it('is overdue when the due date was before today in Dhaka and work is not done (normal)', () => {
    expect(isOverdue(ticket({ status: 'In progress', dueDate: '2026-11-25' }), NOW)).toBe(true);
  });

  it('is not overdue on the due date itself (boundary)', () => {
    expect(isOverdue(ticket({ status: 'Assigned', dueDate: '2026-11-26' }), NOW)).toBe(false);
  });

  it('uses the Dhaka date, not UTC, near midnight (boundary)', () => {
    // 25 Nov 19:30 UTC is already 26 Nov 1:30 am in Dhaka.
    const lateEvening = new Date('2026-11-25T19:30:00Z');
    expect(isOverdue(ticket({ status: 'Assigned', dueDate: '2026-11-25' }), lateEvening)).toBe(
      true,
    );
  });

  it('is not overdue once Fixed, or with no due date', () => {
    expect(isOverdue(ticket({ status: 'Fixed', dueDate: '2026-11-01' }), NOW)).toBe(false);
    expect(isOverdue(ticket({ status: 'Assigned', dueDate: null }), NOW)).toBe(false);
  });
});

describe('summarizeTickets', () => {
  it('counts open, late, overdue and Urgent tickets, skipping final states (normal)', () => {
    const summary = summarizeTickets(
      [
        ticket({ createdAt: new Date(NOW.getTime() - 30 * HOUR) }),
        ticket({ priority: 'Urgent', createdAt: new Date(NOW.getTime() - 2 * HOUR) }),
        ticket({ status: 'Assigned', assigneeId: 'w', dueDate: '2026-11-20' }),
        ticket({ status: 'Fixed', assigneeId: 'w' }),
        ticket({ status: 'Closed', assigneeId: 'w', priority: 'Urgent' }),
        ticket({ status: 'Cancelled', createdAt: new Date(NOW.getTime() - 99 * HOUR) }),
      ],
      NOW,
    );
    expect(summary).toEqual({ open: 4, lateUnassigned: 2, overdue: 1, urgent: 1 });
  });

  it('is all zeros with no tickets (boundary)', () => {
    expect(summarizeTickets([], NOW)).toEqual({
      open: 0,
      lateUnassigned: 0,
      overdue: 0,
      urgent: 0,
    });
  });
});

describe('countMoney', () => {
  it('counts rows and adds their amounts, including a negative correction (normal)', () => {
    expect(countMoney([{ amountPoisha: 1850000 }, { amountPoisha: -50000 }])).toEqual({
      count: 2,
      totalPoisha: 1800000,
    });
  });

  it('is zero for no rows (boundary)', () => {
    expect(countMoney([])).toEqual({ count: 0, totalPoisha: 0 });
  });
});

describe('getManagerHomeSummary', () => {
  function store(overrides: Partial<ManagerHomeStore> = {}): ManagerHomeStore {
    return {
      latestMonthBills: jest.fn(async () => [
        { billingMonth: '2026-11-01', totalPoisha: 485000, status: 'Paid' as const },
      ]),
      openTickets: jest.fn(async () => [ticket()]),
      waitingExpenses: jest.fn(async () => [{ amountPoisha: 1850000 }]),
      flaggedOverpayments: jest.fn(async () => [{ amountPoisha: 485000 }]),
      ...overrides,
    };
  }

  it('builds every card from the store (normal)', async () => {
    await expect(getManagerHomeSummary(store(), NOW)).resolves.toEqual({
      bills: { month: '2026-11-01', billed: 1, paid: 1, billedPoisha: 485000, paidPoisha: 485000 },
      tickets: { open: 1, lateUnassigned: 0, overdue: 0, urgent: 0 },
      waitingExpenses: { count: 1, totalPoisha: 1850000 },
      flaggedOverpayments: { count: 1, totalPoisha: 485000 },
    });
  });

  it('passes on a store failure (exception)', async () => {
    const failing = store({
      openTickets: jest.fn(async () => {
        throw new Error('database down');
      }),
    });
    await expect(getManagerHomeSummary(failing, NOW)).rejects.toThrow('database down');
  });
});
