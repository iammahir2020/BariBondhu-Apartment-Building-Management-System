/**
 * Tests for publishing the fund summary: only after the month has ended (Dhaka date), the first month needs an
 * Approved opening balance, a month is published once, and every publish is audited (BM-12, RES-05, NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import type { FundSummary, NewFundSummary, OpeningBalance } from '@/models';
import {
  MONTH_NOT_ENDED_MESSAGE,
  listPublishedSummaries,
  publishFundSummary,
  type FundPublishDeps,
  type FundSummaryStore,
} from '@/services/fundPublishService';
import { APPROVE_OPENING_BALANCE_MESSAGE } from '@/services/fundSummaryService';
import { memoryAudit } from '@/services/testFakes';

const MANAGER_ID = 'manager-1';
/** 1 Nov 2026, 10:00 in Dhaka: October has ended. */
const AFTER_OCTOBER = new Date('2026-11-01T04:00:00Z');
/** 31 Oct 2026, 23:30 in Dhaka: October has not ended. */
const LAST_DAY = new Date('2026-10-31T17:30:00Z');

/** An in-memory summary store. */
class MemorySummaryStore implements FundSummaryStore {
  readonly rows: FundSummary[] = [];

  async findByMonth(month: string): Promise<FundSummary | undefined> {
    return this.rows.find((row) => row.month === month);
  }

  async insert(summary: NewFundSummary): Promise<FundSummary> {
    const row: FundSummary = {
      id: `summary-${this.rows.length + 1}`,
      month: summary.month,
      openingBalancePoisha: summary.openingBalancePoisha,
      totalCollectedPoisha: summary.totalCollectedPoisha,
      spentRepairPoisha: summary.spentRepairPoisha,
      spentSalaryPoisha: summary.spentSalaryPoisha,
      spentUtilityPoisha: summary.spentUtilityPoisha,
      spentOtherPoisha: summary.spentOtherPoisha,
      closingBalancePoisha: summary.closingBalancePoisha,
      totalOutstandingPoisha: summary.totalOutstandingPoisha,
      status: summary.status ?? 'Draft',
      publishedBy: summary.publishedBy ?? null,
      publishedAt: summary.publishedAt ?? null,
      createdAt: AFTER_OCTOBER,
      updatedAt: AFTER_OCTOBER,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, changes: Partial<NewFundSummary>): Promise<FundSummary> {
    const index = this.rows.findIndex((item) => item.id === id);
    const row = this.rows[index];
    if (!row) throw new Error('No such summary');
    const updated: FundSummary = { ...row, ...changes } as FundSummary;
    this.rows[index] = updated;
    return updated;
  }

  async list(): Promise<FundSummary[]> {
    return [...this.rows];
  }
}

/** An opening balance row. */
function balance(overrides: Partial<OpeningBalance> = {}): OpeningBalance {
  return {
    id: 'balance-1',
    month: '2026-10-01',
    amountPoisha: 1000000,
    note: null,
    status: 'Approved',
    enteredBy: MANAGER_ID,
    decidedBy: 'committee-1',
    decidedAt: AFTER_OCTOBER,
    decisionReason: null,
    createdAt: AFTER_OCTOBER,
    updatedAt: AFTER_OCTOBER,
    ...overrides,
  };
}

function setUp(balances: OpeningBalance[] = [balance()]) {
  const summaries = new MemorySummaryStore();
  const { audit, entries } = memoryAudit();
  const deps: FundPublishDeps = {
    summaries,
    audit,
    figures: {
      async listConfirmedPayments() {
        return [{ amountPoisha: 500000 }];
      },
      async listExpensesDated() {
        return [{ amountPoisha: 200000, category: 'repair', status: 'Approved' }];
      },
      async listBillsOfMonth() {
        return [{ totalPoisha: 380000, status: 'Unpaid' }];
      },
      async findSummaryByMonth(month) {
        return summaries.rows.find((row) => row.month === month);
      },
    },
    balances: {
      async findByMonth(month) {
        return balances.find((row) => row.month === month);
      },
    },
  };
  return { deps, summaries, entries };
}

describe('publishFundSummary', () => {
  it('publishes a month that has ended and logs it (normal, BM-12 c1)', async () => {
    const { deps, summaries, entries } = setUp();
    const saved = await publishFundSummary(deps, '2026-10-01', MANAGER_ID, AFTER_OCTOBER);

    expect(saved).toMatchObject({
      month: '2026-10-01',
      openingBalancePoisha: 1000000,
      totalCollectedPoisha: 500000,
      spentRepairPoisha: 200000,
      closingBalancePoisha: 1300000,
      totalOutstandingPoisha: 380000,
      status: 'Published',
      publishedBy: MANAGER_ID,
      publishedAt: AFTER_OCTOBER,
    });
    expect(summaries.rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: MANAGER_ID,
      action: 'fundSummary.publish',
      entityType: 'fund_summaries',
    });
  });

  it('refuses on the last day of the month (boundary, BM-12 c2)', async () => {
    const { deps, summaries } = setUp();
    await expect(publishFundSummary(deps, '2026-10-01', MANAGER_ID, LAST_DAY)).rejects.toThrow(
      MONTH_NOT_ENDED_MESSAGE,
    );
    expect(summaries.rows).toHaveLength(0);
  });

  it('refuses a month that has not ended and saves nothing (invalid)', async () => {
    const { deps, summaries, entries } = setUp([balance({ month: '2026-12-01' })]);
    await expect(publishFundSummary(deps, '2026-12-01', MANAGER_ID, AFTER_OCTOBER)).rejects.toThrow(
      MONTH_NOT_ENDED_MESSAGE,
    );
    expect(summaries.rows).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('refuses the first month before the opening balance is approved (exception, BM-12 c3)', async () => {
    const { deps, summaries } = setUp([balance({ status: 'Waiting for approval' })]);
    await expect(publishFundSummary(deps, '2026-10-01', MANAGER_ID, AFTER_OCTOBER)).rejects.toThrow(
      APPROVE_OPENING_BALANCE_MESSAGE,
    );
    expect(summaries.rows).toHaveLength(0);
  });

  it('refuses to publish the same month twice', async () => {
    const { deps, summaries } = setUp();
    await publishFundSummary(deps, '2026-10-01', MANAGER_ID, AFTER_OCTOBER);
    await expect(publishFundSummary(deps, '2026-10-01', MANAGER_ID, AFTER_OCTOBER)).rejects.toThrow(
      'already Published',
    );
    expect(summaries.rows).toHaveLength(1);
  });

  it('refuses a month that is not the first of a month', async () => {
    const { deps } = setUp();
    await expect(publishFundSummary(deps, '2026-10-15', MANAGER_ID, AFTER_OCTOBER)).rejects.toThrow(
      'Check the month',
    );
  });
});

describe('listPublishedSummaries', () => {
  it('hides a Draft and lists the newest month first (RES-05 c3)', async () => {
    const { deps, summaries } = setUp();
    await publishFundSummary(deps, '2026-10-01', MANAGER_ID, AFTER_OCTOBER);
    await summaries.insert({
      month: '2026-09-01',
      openingBalancePoisha: 0,
      totalCollectedPoisha: 0,
      spentRepairPoisha: 0,
      spentSalaryPoisha: 0,
      spentUtilityPoisha: 0,
      spentOtherPoisha: 0,
      closingBalancePoisha: 0,
      totalOutstandingPoisha: 0,
      status: 'Published',
    });
    await summaries.insert({
      month: '2026-08-01',
      openingBalancePoisha: 0,
      totalCollectedPoisha: 0,
      spentRepairPoisha: 0,
      spentSalaryPoisha: 0,
      spentUtilityPoisha: 0,
      spentOtherPoisha: 0,
      closingBalancePoisha: 0,
      totalOutstandingPoisha: 0,
      status: 'Draft',
    });

    const months = (await listPublishedSummaries(deps)).map((row) => row.month);
    expect(months).toEqual(['2026-10-01', '2026-09-01']);
  });
});
