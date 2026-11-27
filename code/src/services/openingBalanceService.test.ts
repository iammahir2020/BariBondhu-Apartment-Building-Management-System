/**
 * Tests for the opening balance: the manager enters it, the committee approves or rejects it, and a rejected one
 * goes back to Waiting for approval with a corrected figure. Bad input is refused and every change is audited
 * (BM-12, CM-02, NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import type { NewOpeningBalance, OpeningBalance } from '@/models';
import {
  CHECK_BALANCE_MONTH_MESSAGE,
  INVALID_OPENING_BALANCE_MESSAGE,
  WRITE_BALANCE_REASON_MESSAGE,
  approveOpeningBalance,
  enterOpeningBalance,
  listOpeningBalances,
  rejectOpeningBalance,
  type OpeningBalanceDeps,
  type OpeningBalanceInput,
  type OpeningBalanceStore,
} from '@/services/openingBalanceService';
import { memoryAudit } from '@/services/testFakes';

const MANAGER_ID = 'manager-1';
const COMMITTEE_ID = 'committee-1';
/** 4 Nov 2026, 12:00 in Dhaka. */
const NOW = new Date('2026-11-04T06:00:00Z');

/** An in-memory opening balance store. */
class MemoryBalanceStore implements OpeningBalanceStore {
  readonly rows: OpeningBalance[] = [];

  async findById(id: string): Promise<OpeningBalance | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async findByMonth(month: string): Promise<OpeningBalance | undefined> {
    return this.rows.find((row) => row.month === month);
  }

  async insert(balance: NewOpeningBalance): Promise<OpeningBalance> {
    const row: OpeningBalance = {
      id: `balance-${this.rows.length + 1}`,
      month: balance.month,
      amountPoisha: balance.amountPoisha,
      note: balance.note ?? null,
      status: balance.status ?? 'Waiting for approval',
      enteredBy: balance.enteredBy,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, changes: Partial<NewOpeningBalance>): Promise<OpeningBalance> {
    const index = this.rows.findIndex((item) => item.id === id);
    const row = this.rows[index];
    if (!row) throw new Error('No such opening balance');
    const updated: OpeningBalance = { ...row, ...changes } as OpeningBalance;
    this.rows[index] = updated;
    return updated;
  }

  async list(): Promise<OpeningBalance[]> {
    return [...this.rows];
  }
}

function setUp() {
  const store = new MemoryBalanceStore();
  const { audit, entries } = memoryAudit();
  const deps: OpeningBalanceDeps = { balances: store, audit };
  return { deps, store, entries };
}

/** A valid input, with fields to change. */
function input(overrides: Partial<OpeningBalanceInput> = {}): OpeningBalanceInput {
  return {
    month: '2026-10-01',
    amountPoisha: 31240000,
    note: 'Closing figure from the paper accounts',
    ...overrides,
  };
}

describe('enterOpeningBalance', () => {
  it('saves the balance as Waiting for approval and logs it (normal, BM-12)', async () => {
    const { deps, store, entries } = setUp();
    const created = await enterOpeningBalance(
      deps,
      input({ note: '  From paper  ' }),
      MANAGER_ID,
      NOW,
    );

    expect(created).toMatchObject({
      month: '2026-10-01',
      amountPoisha: 31240000,
      note: 'From paper',
      status: 'Waiting for approval',
      enteredBy: MANAGER_ID,
    });
    expect(store.rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: MANAGER_ID,
      action: 'openingBalance.enter',
      entityType: 'opening_balances',
    });
  });

  it('keeps a blank note as null', async () => {
    const { deps } = setUp();
    const created = await enterOpeningBalance(deps, input({ note: '   ' }), MANAGER_ID, NOW);
    expect(created.note).toBeNull();
  });

  it('accepts a balance of 0 (boundary)', async () => {
    const { deps } = setUp();
    const created = await enterOpeningBalance(deps, input({ amountPoisha: 0 }), MANAGER_ID, NOW);
    expect(created.amountPoisha).toBe(0);
  });

  it.each([null, -1, 12.5])('refuses the amount %s and saves nothing (invalid)', async (amount) => {
    const { deps, store, entries } = setUp();
    await expect(
      enterOpeningBalance(deps, input({ amountPoisha: amount }), MANAGER_ID, NOW),
    ).rejects.toThrow(INVALID_OPENING_BALANCE_MESSAGE);
    expect(store.rows).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it.each([null, '2026-10-15', '2026-02-30', 'October'])(
    'refuses the month %s (invalid)',
    async (month) => {
      const { deps, store } = setUp();
      await expect(enterOpeningBalance(deps, input({ month }), MANAGER_ID, NOW)).rejects.toThrow(
        CHECK_BALANCE_MONTH_MESSAGE,
      );
      expect(store.rows).toHaveLength(0);
    },
  );

  it('refuses a new figure while the balance is Waiting for approval', async () => {
    const { deps } = setUp();
    await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await expect(
      enterOpeningBalance(deps, input({ amountPoisha: 100 }), MANAGER_ID, NOW),
    ).rejects.toThrow('already Waiting for approval');
  });

  it('refuses a new figure once the balance is Approved (Approved is final)', async () => {
    const { deps } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await approveOpeningBalance(deps, created.id, COMMITTEE_ID, NOW);
    await expect(
      enterOpeningBalance(deps, input({ amountPoisha: 100 }), MANAGER_ID, NOW),
    ).rejects.toThrow('already Approved');
  });

  it('takes a corrected figure after a rejection and goes back to Waiting (CM-02 c6)', async () => {
    const { deps, store, entries } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await rejectOpeningBalance(
      deps,
      created.id,
      'Figure does not match the paper accounts',
      COMMITTEE_ID,
      NOW,
    );

    const corrected = await enterOpeningBalance(
      deps,
      input({ amountPoisha: 31000000 }),
      MANAGER_ID,
      NOW,
    );

    expect(corrected).toMatchObject({
      id: created.id,
      amountPoisha: 31000000,
      status: 'Waiting for approval',
      decidedBy: null,
      decisionReason: null,
    });
    expect(store.rows).toHaveLength(1);
    expect(entries[entries.length - 1]).toMatchObject({ action: 'openingBalance.reenter' });
  });
});

describe('approveOpeningBalance', () => {
  it('approves a waiting balance and saves who and when (normal, CM-02 c5)', async () => {
    const { deps, entries } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    const approved = await approveOpeningBalance(deps, created.id, COMMITTEE_ID, NOW);

    expect(approved).toMatchObject({
      status: 'Approved',
      decidedBy: COMMITTEE_ID,
      decidedAt: NOW,
    });
    expect(entries[entries.length - 1]).toMatchObject({
      actorId: COMMITTEE_ID,
      action: 'openingBalance.approve',
    });
  });

  it('shows the current status when it is already decided (exception)', async () => {
    const { deps } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await approveOpeningBalance(deps, created.id, COMMITTEE_ID, NOW);
    await expect(approveOpeningBalance(deps, created.id, COMMITTEE_ID, NOW)).rejects.toThrow(
      'already Approved',
    );
  });

  it('fails when there is no such balance', async () => {
    const { deps } = setUp();
    await expect(approveOpeningBalance(deps, 'missing', COMMITTEE_ID, NOW)).rejects.toThrow(
      'does not exist',
    );
  });
});

describe('rejectOpeningBalance', () => {
  it('rejects a waiting balance with the reason, who and when (normal, CM-02 c6)', async () => {
    const { deps, entries } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    const rejected = await rejectOpeningBalance(
      deps,
      created.id,
      '  Figure is wrong  ',
      COMMITTEE_ID,
      NOW,
    );

    expect(rejected).toMatchObject({
      status: 'Rejected',
      decidedBy: COMMITTEE_ID,
      decidedAt: NOW,
      decisionReason: 'Figure is wrong',
    });
    expect(entries[entries.length - 1]).toMatchObject({ action: 'openingBalance.reject' });
  });

  it.each([null, '', '   '])('needs a reason, "%s" is refused (invalid)', async (reason) => {
    const { deps, store } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await expect(rejectOpeningBalance(deps, created.id, reason, COMMITTEE_ID, NOW)).rejects.toThrow(
      WRITE_BALANCE_REASON_MESSAGE,
    );
    expect(store.rows[0]?.status).toBe('Waiting for approval');
  });

  it('shows the current status when it is already decided (exception)', async () => {
    const { deps } = setUp();
    const created = await enterOpeningBalance(deps, input(), MANAGER_ID, NOW);
    await approveOpeningBalance(deps, created.id, COMMITTEE_ID, NOW);
    await expect(
      rejectOpeningBalance(deps, created.id, 'Too late', COMMITTEE_ID, NOW),
    ).rejects.toThrow('already Approved');
  });
});

describe('listOpeningBalances', () => {
  it('lists the newest month first', async () => {
    const { deps } = setUp();
    await enterOpeningBalance(deps, input({ month: '2026-09-01' }), MANAGER_ID, NOW);
    await enterOpeningBalance(deps, input({ month: '2026-11-01' }), MANAGER_ID, NOW);
    await enterOpeningBalance(deps, input({ month: '2026-10-01' }), MANAGER_ID, NOW);

    const months = (await listOpeningBalances(deps)).map((row) => row.month);
    expect(months).toEqual(['2026-11-01', '2026-10-01', '2026-09-01']);
  });
});
