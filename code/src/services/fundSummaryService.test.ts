/**
 * Tests for working out a month of the fund summary: closing balance, collected by confirmed date, spent from
 * Approved expenses only, outstanding bills and the opening balance chain (BM-12, BR-10, NFR-26).
 *
 * @author Ayesha Siddiqa
 */
import type { Bill, Expense, FundSummary, OpeningBalance } from '@/models';
import {
  APPROVE_OPENING_BALANCE_MESSAGE,
  CHECK_FUND_MONTH_MESSAGE,
  ENTER_OPENING_BALANCE_MESSAGE,
  workOutMonth,
  type FundFigureDeps,
} from '@/services/fundSummaryService';

const NOW = new Date('2026-11-04T06:00:00Z');

interface PaymentRow {
  amountPoisha: number;
  confirmedAt: Date;
}
interface ExpenseRow {
  amountPoisha: number;
  category: Expense['category'];
  status: Expense['status'];
  expenseDate: string;
}
interface BillRow {
  totalPoisha: number;
  status: Bill['status'];
  billingMonth: string;
}

interface Data {
  payments?: PaymentRow[];
  expenses?: ExpenseRow[];
  bills?: BillRow[];
  summaries?: FundSummary[];
  balances?: OpeningBalance[];
}

/** Builds in-memory stores that cut the rows by the range the service asks for. */
function setUp(data: Data = {}): FundFigureDeps {
  const { payments = [], expenses = [], bills = [], summaries = [], balances = [] } = data;
  return {
    figures: {
      async listConfirmedPayments(from, to) {
        return payments.filter((row) => row.confirmedAt >= from && row.confirmedAt < to);
      },
      async listExpensesDated(from, to) {
        return expenses.filter((row) => row.expenseDate >= from && row.expenseDate < to);
      },
      async listBillsOfMonth(month) {
        return bills.filter((row) => row.billingMonth === month);
      },
      async findSummaryByMonth(month) {
        return summaries.find((row) => row.month === month);
      },
    },
    balances: {
      async findByMonth(month) {
        return balances.find((row) => row.month === month);
      },
    },
  };
}

/** An opening balance row. */
function balance(overrides: Partial<OpeningBalance> = {}): OpeningBalance {
  return {
    id: 'balance-1',
    month: '2026-10-01',
    amountPoisha: 31240000,
    note: null,
    status: 'Approved',
    enteredBy: 'manager-1',
    decidedBy: 'committee-1',
    decidedAt: NOW,
    decisionReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A saved summary row. */
function summary(overrides: Partial<FundSummary> = {}): FundSummary {
  return {
    id: 'summary-1',
    month: '2026-10-01',
    openingBalancePoisha: 31240000,
    totalCollectedPoisha: 3500000,
    spentRepairPoisha: 1850000,
    spentSalaryPoisha: 19300000,
    spentUtilityPoisha: 0,
    spentOtherPoisha: 0,
    closingBalancePoisha: 13590000,
    totalOutstandingPoisha: 1140000,
    status: 'Published',
    publishedBy: 'manager-1',
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A confirmed payment. */
function payment(amountPoisha: number, confirmedAt: string): PaymentRow {
  return { amountPoisha, confirmedAt: new Date(confirmedAt) };
}

/** An expense row dated in October 2026 unless said otherwise. */
function expense(
  amountPoisha: number,
  category: Expense['category'],
  status: Expense['status'] = 'Approved',
  expenseDate = '2026-10-10',
): ExpenseRow {
  return { amountPoisha, category, status, expenseDate };
}

/** A bill of October 2026. */
function bill(totalPoisha: number, status: Bill['status']): BillRow {
  return { totalPoisha, status, billingMonth: '2026-10-01' };
}

describe('workOutMonth', () => {
  it('works out every figure of a month with an approved opening balance (normal, BM-12 c1)', async () => {
    const deps = setUp({
      balances: [balance()],
      payments: [
        payment(2000000, '2026-10-05T06:00:00Z'),
        payment(1500000, '2026-10-20T06:00:00Z'),
      ],
      expenses: [
        expense(1850000, 'repair'),
        expense(19500000, 'salary'),
        expense(-200000, 'salary'),
      ],
      bills: [bill(380000, 'Unpaid'), bill(380000, 'Paid')],
    });

    expect(await workOutMonth(deps, '2026-10-01')).toEqual({
      month: '2026-10-01',
      openingBalancePoisha: 31240000,
      totalCollectedPoisha: 3500000,
      spentRepairPoisha: 1850000,
      spentSalaryPoisha: 19300000,
      spentUtilityPoisha: 0,
      spentOtherPoisha: 0,
      closingBalancePoisha: 13590000,
      totalOutstandingPoisha: 380000,
    });
  });

  it('counts payments by the Dhaka date they were confirmed (boundary, BR-10)', async () => {
    const deps = setUp({
      balances: [balance()],
      payments: [
        payment(100, '2026-09-30T17:30:00Z'),
        payment(200, '2026-09-30T18:30:00Z'),
        payment(400, '2026-10-31T17:30:00Z'),
        payment(800, '2026-10-31T18:30:00Z'),
      ],
    });
    const figures = await workOutMonth(deps, '2026-10-01');
    expect(figures.totalCollectedPoisha).toBe(600);
  });

  it('counts expenses by expense date and only Approved ones (BM-12 c4, BR-10)', async () => {
    const deps = setUp({
      balances: [balance()],
      expenses: [
        expense(1000, 'utility'),
        expense(2000, 'utility', 'Waiting for approval'),
        expense(4000, 'utility', 'Rejected'),
        expense(8000, 'other', 'Approved', '2026-09-30'),
        expense(16000, 'other', 'Approved', '2026-11-01'),
        expense(32000, 'other'),
      ],
    });
    const figures = await workOutMonth(deps, '2026-10-01');
    expect(figures.spentUtilityPoisha).toBe(1000);
    expect(figures.spentOtherPoisha).toBe(32000);
  });

  it('lets a negative correcting expense reduce what was spent (BM-08 c5)', async () => {
    const deps = setUp({
      balances: [balance({ amountPoisha: 0 })],
      expenses: [expense(19500000, 'salary'), expense(-200000, 'salary')],
    });
    const figures = await workOutMonth(deps, '2026-10-01');
    expect(figures.spentSalaryPoisha).toBe(19300000);
    expect(figures.closingBalancePoisha).toBe(-19300000);
  });

  it('counts only the bills still owed as outstanding (NFR-26)', async () => {
    const deps = setUp({
      balances: [balance()],
      bills: [
        bill(100, 'Unpaid'),
        bill(200, 'Payment pending'),
        bill(400, 'Awaiting verification'),
        bill(800, 'Paid'),
        bill(1600, 'Carried forward'),
      ],
    });
    const figures = await workOutMonth(deps, '2026-10-01');
    expect(figures.totalOutstandingPoisha).toBe(700);
  });

  it('gives zero collected and spent for an empty month, closing equals opening (boundary)', async () => {
    const figures = await workOutMonth(setUp({ balances: [balance()] }), '2026-10-01');
    expect(figures).toMatchObject({
      totalCollectedPoisha: 0,
      spentRepairPoisha: 0,
      spentSalaryPoisha: 0,
      spentUtilityPoisha: 0,
      spentOtherPoisha: 0,
      totalOutstandingPoisha: 0,
      closingBalancePoisha: 31240000,
    });
  });

  it("opens the next month with the previous month's closing balance (BR-10)", async () => {
    const deps = setUp({ summaries: [summary()] });
    const figures = await workOutMonth(deps, '2026-11-01');
    expect(figures.openingBalancePoisha).toBe(13590000);
    expect(figures.closingBalancePoisha).toBe(13590000);
  });

  it('does not start from a previous summary that is still a Draft', async () => {
    const deps = setUp({ summaries: [summary({ status: 'Draft' })] });
    await expect(workOutMonth(deps, '2026-11-01')).rejects.toThrow(ENTER_OPENING_BALANCE_MESSAGE);
  });

  it('refuses the first month when no opening balance was entered (BM-12 c3)', async () => {
    await expect(workOutMonth(setUp(), '2026-10-01')).rejects.toThrow(
      ENTER_OPENING_BALANCE_MESSAGE,
    );
  });

  it.each(['Waiting for approval', 'Rejected'] as const)(
    'refuses the first month while the opening balance is %s (BM-12 c3)',
    async (status) => {
      const deps = setUp({ balances: [balance({ status })] });
      await expect(workOutMonth(deps, '2026-10-01')).rejects.toThrow(
        APPROVE_OPENING_BALANCE_MESSAGE,
      );
    },
  );

  it.each(['2026-10-15', '2026-02-30', 'October', ''])(
    'refuses the month "%s" (invalid)',
    async (month) => {
      await expect(workOutMonth(setUp(), month)).rejects.toThrow(CHECK_FUND_MONTH_MESSAGE);
    },
  );
});
