/**
 * Unit tests for monthly bill generation (BB-0505).
 *
 * Covers BM-03 business rules and NFR-27 audit logging.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Bill, ChargeRate, Flat, Occupancy } from '@/models';

import {
  generateMonthlyBills,
  type MonthlyBillDraft,
  type MonthlyBillStore,
} from '@/services/generateMonthlyBills';

import type { AuditWriter } from '@/services/auditService';

const MONTH = '2026-11-01';
const DUE = '2026-11-20';
const MANAGER_ID = 'manager-1';

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

  async monthHasBills(billingMonth: string): Promise<boolean> {
    return this.bills.some((bill) => bill.billingMonth === billingMonth);
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

  const audit = jest.fn<ReturnType<AuditWriter>, Parameters<AuditWriter>>(async () => undefined);

  return {
    store,
    audit,
    deps: { store, audit },
  };
}

describe('generateMonthlyBills (BB-0505)', () => {
  it('generates a bill for every flat', async () => {
    const { deps, store } = setup();

    const result = await generateMonthlyBills(
      deps,
      { billingMonth: MONTH, dueDate: DUE },
      MANAGER_ID,
    );

    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(store.bills).toHaveLength(2);
  });

  it('links occupied flats to their active occupancy', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    expect(store.bills[0]?.occupancyId).toBe('occupancy-1');
  });

  it('generates bills for vacant flats', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    expect(store.bills[1]?.occupancyId).toBeNull();
  });

  it('copies current rates into three line items', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    expect(store.savedDrafts[0]?.lineItems).toMatchObject([
      { type: 'service', amountPoisha: 500000 },
      { type: 'generator', amountPoisha: 200000 },
      { type: 'water', amountPoisha: 100000 },
    ]);

    expect(store.bills[0]?.totalPoisha).toBe(800000);
  });

  it('refuses to generate bills for an existing month', async () => {
    const { deps, store, audit } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    audit.mockClear();

    await expect(
      generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID),
    ).rejects.toThrow('Bills for this month already exist');

    expect(store.bills).toHaveLength(2);
    expect(audit).not.toHaveBeenCalled();
  });

  it('does not bill newly added flats on a second run', async () => {
    const { deps, store } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    store.flats.push(flat('flat-3'));

    await expect(
      generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID),
    ).rejects.toThrow('Bills for this month already exist');

    expect(store.bills).toHaveLength(2);
  });

  it('marks zero-amount bills as Paid', async () => {
    const { deps, store } = setup();

    store.rates = [rate('service', 0), rate('generator', 0), rate('water', 0)];

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    expect(store.bills[0]?.totalPoisha).toBe(0);
    expect(store.bills[0]?.status).toBe('Paid');
  });

  it('rejects missing rates using the exact SRS message', async () => {
    const { deps, store } = setup();

    store.rates = [rate('service', 500000)];

    await expect(
      generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID),
    ).rejects.toThrow('Ask the committee to set the charge rates first');

    expect(store.bills).toHaveLength(0);
  });

  it('rejects a due date before the month', async () => {
    const { deps } = setup();

    await expect(
      generateMonthlyBills(
        deps,
        {
          billingMonth: MONTH,
          dueDate: '2026-10-31',
        },
        MANAGER_ID,
      ),
    ).rejects.toThrow('Check the due date');
  });

  it('rejects an invalid due date', async () => {
    const { deps } = setup();

    await expect(
      generateMonthlyBills(
        deps,
        {
          billingMonth: MONTH,
          dueDate: '2026-02-30',
        },
        MANAGER_ID,
      ),
    ).rejects.toThrow('Check the due date');
  });

  it('rejects an invalid billing month', async () => {
    const { deps } = setup();

    await expect(
      generateMonthlyBills(
        deps,
        {
          billingMonth: '2026-11-15',
          dueDate: DUE,
        },
        MANAGER_ID,
      ),
    ).rejects.toThrow('Enter a valid billing month');
  });

  it('rejects multiple active occupancies for one flat', async () => {
    const { deps, store } = setup();

    store.occupancies.push(occupancy('occupancy-2', 'flat-1'));

    await expect(
      generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID),
    ).rejects.toThrow('A flat has more than one active occupancy');
  });

  it('writes one audit entry for generation', async () => {
    const { deps, audit } = setup();

    await generateMonthlyBills(deps, { billingMonth: MONTH, dueDate: DUE }, MANAGER_ID);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: MANAGER_ID,
        action: 'bill.generate',
        entityType: 'bills',
        newValues: expect.objectContaining({
          billingMonth: MONTH,
          dueDate: DUE,
          createdCount: 2,
        }),
      }),
    );
  });

  it('creates no bills when there are no flats', async () => {
    const { deps, store } = setup();

    store.flats = [];
    store.occupancies = [];

    const result = await generateMonthlyBills(
      deps,
      { billingMonth: MONTH, dueDate: DUE },
      MANAGER_ID,
    );

    expect(result.createdCount).toBe(0);
    expect(store.bills).toHaveLength(0);
  });
});
