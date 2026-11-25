/**
 * Database adapter tests for unpaid bill correction.
 *
 * BB-0507, BM-03, BR-07, NFR-26, NFR-27.
 * Uses a mocked database transaction.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { auditLogs, billLineItems, type Bill } from '@/models';

import { databaseBillCorrectionStore } from '@/lib/adapters/billCorrectionAdapters';

import type {
  BillCorrectionOperation,
  BillCorrectionResult,
} from '@/services/billCorrectionService';

function makeBill(changes: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    flatId: 'flat-1',
    occupancyId: 'household-1',
    billingMonth: '2026-11-01',
    dueDate: '2026-11-20',
    totalPoisha: 300000,
    status: 'Unpaid',
    createdAt: new Date('2026-11-01'),
    updatedAt: new Date('2026-11-01'),
    ...changes,
  };
}

const validOperation: BillCorrectionOperation = {
  billId: 'bill-1',
  managerId: 'manager-1',
  adjustmentPoisha: -50000,
  reason: 'Incorrect generator charge',
  expectedTotalPoisha: 300000,
  newTotalPoisha: 250000,
  newStatus: 'Unpaid',
  excessCreditPoisha: 0,
};

interface TestOptions {
  bill?: Bill | null;
  failAudit?: boolean;
}

function setup(options: TestOptions = {}) {
  const bill = options.bill === undefined ? makeBill() : options.bill;

  const writes: Array<{
    table: unknown;
    values: unknown;
  }> = [];

  const updates: unknown[] = [];

  const select = jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue(bill ? [bill] : []),
      })),
    })),
  }));

  const execute = jest.fn().mockResolvedValue([]);

  const insert = jest.fn((table: unknown) => ({
    values: jest.fn(async (values: unknown) => {
      writes.push({ table, values });

      if (table === auditLogs && options.failAudit) {
        throw new Error('Audit write failed');
      }
    }),
  }));

  const update = jest.fn(() => ({
    set: jest.fn((values: unknown) => {
      updates.push(values);

      return {
        where: jest.fn().mockResolvedValue([]),
      };
    }),
  }));

  const tx = {
    execute,
    select,
    insert,
    update,
  };

  const transaction = jest.fn(
    async (callback: (transaction: typeof tx) => Promise<BillCorrectionResult>) => callback(tx),
  );

  const db = {
    select,
    transaction,
  } as unknown as Database;

  return {
    store: databaseBillCorrectionStore(db),
    transaction,
    execute,
    insert,
    update,
    writes,
    updates,
  };
}

describe('databaseBillCorrectionStore (BB-0507)', () => {
  it('finds an existing bill', async () => {
    const { store } = setup();

    const result = await store.findBillById('bill-1');

    expect(result?.id).toBe('bill-1');
    expect(result?.totalPoisha).toBe(300000);
  });

  it('returns undefined when the bill is missing', async () => {
    const { store } = setup({ bill: null });

    const result = await store.findBillById('missing');

    expect(result).toBeUndefined();
  });

  it('saves an adjustment and audit log in a transaction', async () => {
    const { store, transaction, execute, writes, updates } = setup();

    const result = await store.applyCorrection(validOperation);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      billId: 'bill-1',
      previousTotalPoisha: 300000,
      newTotalPoisha: 250000,
      adjustmentPoisha: -50000,
      excessCreditPoisha: 0,
      status: 'Unpaid',
    });

    expect(writes).toHaveLength(2);

    expect(writes[0]).toEqual({
      table: billLineItems,
      values: expect.objectContaining({
        billId: 'bill-1',
        type: 'adjustment',
        amountPoisha: -50000,
        description: 'Incorrect generator charge',
      }),
    });

    expect(updates).toHaveLength(1);

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 250000,
        status: 'Unpaid',
      }),
    );

    expect(writes[1]).toEqual({
      table: auditLogs,
      values: expect.objectContaining({
        actorId: 'manager-1',
        action: 'bill.correct',
        entityType: 'bills',
        entityId: 'bill-1',
        oldValues: {
          totalPoisha: 300000,
          status: 'Unpaid',
        },
        newValues: {
          totalPoisha: 250000,
          status: 'Unpaid',
          adjustmentPoisha: -50000,
          excessCreditPoisha: 0,
          reason: 'Incorrect generator charge',
        },
      }),
    });
  });

  it('supports increasing the unpaid balance', async () => {
    const { store, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: 40000,
      newTotalPoisha: 340000,
    });

    expect(result.newTotalPoisha).toBe(340000);
    expect(result.status).toBe('Unpaid');

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 340000,
        status: 'Unpaid',
      }),
    );
  });

  it('marks the bill Paid when the balance reaches zero', async () => {
    const { store, writes, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: -300000,
      newTotalPoisha: 0,
      newStatus: 'Paid',
    });

    expect(result.newTotalPoisha).toBe(0);
    expect(result.excessCreditPoisha).toBe(0);
    expect(result.status).toBe('Paid');

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 0,
        status: 'Paid',
      }),
    );

    expect(writes[1]?.table).toBe(auditLogs);
  });

  it('trims the reason saved with the adjustment', async () => {
    const { store, writes } = setup();

    await store.applyCorrection({
      ...validOperation,
      reason: '  Incorrect generator charge  ',
    });

    expect(writes[0]?.values).toEqual(
      expect.objectContaining({
        description: 'Incorrect generator charge',
      }),
    );
  });

  it('rejects a missing bill', async () => {
    const { store, writes, updates } = setup({
      bill: null,
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow('Bill not found');

    expect(writes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'rejects correction of a %s bill',
    async (status) => {
      const { store, writes, updates } = setup({
        bill: makeBill({ status }),
      });

      await expect(store.applyCorrection(validOperation)).rejects.toThrow(
        'Only Unpaid bills can be corrected',
      );

      expect(writes).toHaveLength(0);
      expect(updates).toHaveLength(0);
    },
  );

  it('rejects a bill whose total changed', async () => {
    const { store, writes } = setup({
      bill: makeBill({ totalPoisha: 280000 }),
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow(
      'Bill total changed during correction',
    );

    expect(writes).toHaveLength(0);
  });

  it('rejects a negative existing bill total', async () => {
    const { store, writes } = setup({
      bill: makeBill({ totalPoisha: -100 }),
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow('Invalid bill total');

    expect(writes).toHaveLength(0);
  });

  it('rejects an adjustment without a reason', async () => {
    const { store, transaction } = setup();

    await expect(
      store.applyCorrection({
        ...validOperation,
        reason: '   ',
      }),
    ).rejects.toThrow('Bill, manager and reason are required');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing manager ID', async () => {
    const { store, transaction } = setup();

    await expect(
      store.applyCorrection({
        ...validOperation,
        managerId: '',
      }),
    ).rejects.toThrow('Bill, manager and reason are required');

    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, Number.NaN, 2147483648, -2147483649])(
    'rejects invalid adjustment %s',
    async (adjustmentPoisha) => {
      const { store, transaction } = setup();

      await expect(
        store.applyCorrection({
          ...validOperation,
          adjustmentPoisha,
        }),
      ).rejects.toThrow('Enter a valid adjustment amount');

      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a corrected total above the integer limit', async () => {
    const { store, writes } = setup({
      bill: makeBill({ totalPoisha: 2147483640 }),
    });

    await expect(
      store.applyCorrection({
        ...validOperation,
        expectedTotalPoisha: 2147483640,
        adjustmentPoisha: 100,
        newTotalPoisha: 2147483740,
      }),
    ).rejects.toThrow('The corrected bill amount is outside the allowed range');

    expect(writes).toHaveLength(0);
  });

  it('saves excess credit as a negative Paid balance', async () => {
    const { store, writes, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: -350000,
      newTotalPoisha: -50000,
      newStatus: 'Paid',
      excessCreditPoisha: 50000,
    });

    expect(result).toEqual({
      billId: 'bill-1',
      previousTotalPoisha: 300000,
      newTotalPoisha: -50000,
      adjustmentPoisha: -350000,
      excessCreditPoisha: 50000,
      status: 'Paid',
    });

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: -50000,
        status: 'Paid',
      }),
    );

    expect(writes[0]).toEqual({
      table: billLineItems,
      values: expect.objectContaining({
        billId: 'bill-1',
        type: 'adjustment',
        amountPoisha: -350000,
      }),
    });

    expect(writes[1]).toEqual({
      table: auditLogs,
      values: expect.objectContaining({
        newValues: expect.objectContaining({
          totalPoisha: -50000,
          excessCreditPoisha: 50000,
        }),
      }),
    });
  });

  it('rejects inconsistent operation details', async () => {
    const { store, writes } = setup();

    await expect(
      store.applyCorrection({
        ...validOperation,
        newTotalPoisha: 260000,
      }),
    ).rejects.toThrow('Correction details have changed');

    expect(writes).toHaveLength(0);
  });

  it('propagates an audit failure from the transaction', async () => {
    const { store, transaction, writes } = setup({
      failAudit: true,
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow('Audit write failed');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(writes[1]?.table).toBe(auditLogs);
  });
});
