/**
 * Unit tests for BB-0505 monthly bill generation.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Bill, ChargeRate, Flat, Occupancy } from '@/models';

import {
  generateMonthlyBills,
  type MonthlyBillDraft,
  type MonthlyBillStore,
} from '@/services/generateMonthlyBills';

const MONTH = '2026-11-01';
const DUE = '2026-11-20';

function flat(id: string): Flat {
  return {
    id,
    blockId: 'block-1',
    number: id,
    floor: 1,
    createdAt: new Date(),
  };
}

function occupancy(id: string, flatId: string): Occupancy {
  return {
    id,
    flatId,
    householdName: 'Test Household',
    type: 'owner',
    startDate: '2026-01-01',
    endDate: null,
    endNote: null,
    createdAt: new Date(),
  } as unknown as Occupancy;
}

function rate(type: ChargeRate['chargeType'], amountPoisha: number): ChargeRate {
  return {
    id: `rate-${type}`,
    chargeType: type,
    amountPoisha,
    meetingDate: '2026-10-15',
    setBy: 'committee-1',
    status: 'Current',
    createdAt: new Date(),
  };
}

class MemoryBillStore implements MonthlyBillStore {
  flats: Flat[] = [flat('flat-1'), flat('flat-2')];

  occupancies: Occupancy[] = [occupancy('occupancy-1', 'flat-1')];

  rates: ChargeRate[] = [rate('service', 500000), rate('generator', 200000), rate('water', 100000)];

  bills: Bill[] = [];
  savedDrafts: MonthlyBillDraft[] = [];

  async listFlats(): Promise<Flat[]> {
    return this.flats;
  }

  async listActiveOccupancies(): Promise<Occupancy[]> {
    return this.occupancies;
  }

  async listCurrentRates(): Promise<ChargeRate[]> {
    return this.rates;
  }

  async createMissing(drafts: MonthlyBillDraft[]): Promise<Bill[]> {
    const created: Bill[] = [];

    for (const draft of drafts) {
      const exists = this.bills.some(
        (bill) =>
          bill.flatId === draft.bill.flatId && bill.billingMonth === draft.bill.billingMonth,
      );

      if (exists) continue;

      const now = new Date();

      const bill: Bill = {
        id: `bill-${this.bills.length + 1}`,
        flatId: draft.bill.flatId,
        occupancyId: draft.bill.occupancyId ?? null,
        billingMonth: draft.bill.billingMonth,
        dueDate: draft.bill.dueDate,
        totalPoisha: draft.bill.totalPoisha ?? 0,
        status: draft.bill.status ?? 'Unpaid',
        createdAt: now,
        updatedAt: now,
      };

      this.bills.push(bill);
      this.savedDrafts.push(draft);
      created.push(bill);
    }

    return created;
  }
}

function setup() {
  const store = new MemoryBillStore();
  return {
    store,
    deps: { store },
  };
}

describe('generateMonthlyBills (BB-0505)', () => {
  it('generates a bill for every flat', async () => {
    const { deps, store } = setup();

    const result = await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(store.bills).toHaveLength(2);
  });

  it('links occupied flats to their active occupancy', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(store.bills[0]?.occupancyId).toBe('occupancy-1');
  });

  it('generates bills for vacant flats', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(store.bills[1]?.occupancyId).toBeNull();
  });

  it('copies three current rates into each bill', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(store.savedDrafts[0]?.lineItems).toMatchObject([
      { type: 'service', amountPoisha: 500000 },
      { type: 'generator', amountPoisha: 200000 },
      { type: 'water', amountPoisha: 100000 },
    ]);

    expect(store.bills[0]?.totalPoisha).toBe(800000);
  });

  it('does not generate duplicate monthly bills', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    const second = await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(2);
    expect(store.bills).toHaveLength(2);
  });

  it('keeps existing bills unchanged after rates change', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    store.rates[0] = rate('service', 900000);

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(store.bills[0]?.totalPoisha).toBe(800000);
    expect(store.savedDrafts[0]?.lineItems[0]?.amountPoisha).toBe(500000);
  });

  it('marks zero-amount bills as Paid', async () => {
    const { deps, store } = setup();

    store.rates = [rate('service', 0), rate('generator', 0), rate('water', 0)];

    await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(store.bills[0]?.totalPoisha).toBe(0);
    expect(store.bills[0]?.status).toBe('Paid');
  });

  it('rejects generation when a charge rate is missing', async () => {
    const { deps, store } = setup();

    store.rates = [rate('service', 500000)];

    await expect(
      generateMonthlyBills(deps, {
        billingMonth: MONTH,
        dueDate: DUE,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(store.bills).toHaveLength(0);
  });

  it.each([
    ['2026-11-15', DUE],
    [MONTH, '2026-10-31'],
    ['2026-02-30', DUE],
    [MONTH, '2026-02-30'],
  ])('rejects an invalid billing period (%s, %s)', async (month, due) => {
    const { deps } = setup();

    await expect(
      generateMonthlyBills(deps, {
        billingMonth: month,
        dueDate: due,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects multiple active occupancies for one flat', async () => {
    const { deps, store } = setup();

    store.occupancies.push(occupancy('occupancy-2', 'flat-1'));

    await expect(
      generateMonthlyBills(deps, {
        billingMonth: MONTH,
        dueDate: DUE,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates no bills if the building has no flats', async () => {
    const { deps, store } = setup();

    store.flats = [];
    store.occupancies = [];

    const result = await generateMonthlyBills(deps, {
      billingMonth: MONTH,
      dueDate: DUE,
    });

    expect(result.createdCount).toBe(0);
    expect(store.bills).toHaveLength(0);
  });
});
