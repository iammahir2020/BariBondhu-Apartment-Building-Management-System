/**
 * Tests for the unpaid bill correction database adapter.
 *
 * BB-0507, BR-07, NFR-26, NFR-27.
 *
 * Database operations are mocked.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { auditLogs, billLineItems, type Bill } from '@/models';

import { databaseBillCorrectionStore } from './billCorrectionAdapters';

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

  it('returns undefined for a missing bill', async () => {
    const { store } = setup({ bill: null });

    const result = await store.findBillById('missing');

    expect(result).toBeUndefined();
  });

  it('locks the bill and saves the correction in a transaction', async () => {
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
  });

  it('saves the audit entry with old and new values', async () => {
    const { store, writes } = setup();

    await store.applyCorrection(validOperation);

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

  it('saves a positive adjustment calculated by the service', async () => {
    const { store, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: 40000,
      newTotalPoisha: 340000,
    });

    expect(result.newTotalPoisha).toBe(340000);

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 340000,
        status: 'Unpaid',
      }),
    );
  });

  it('saves Paid status for a zero balance', async () => {
    const { store, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: -300000,
      newTotalPoisha: 0,
      newStatus: 'Paid',
    });

    expect(result.newTotalPoisha).toBe(0);
    expect(result.status).toBe('Paid');

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 0,
        status: 'Paid',
      }),
    );
  });

  it('preserves a negative credit balance from the service', async () => {
    const { store, writes, updates } = setup();

    const result = await store.applyCorrection({
      ...validOperation,
      adjustmentPoisha: -350000,
      newTotalPoisha: -50000,
      newStatus: 'Paid',
      excessCreditPoisha: 50000,
    });

    expect(result.newTotalPoisha).toBe(-50000);
    expect(result.excessCreditPoisha).toBe(50000);
    expect(result.status).toBe('Paid');

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: -50000,
        status: 'Paid',
      }),
    );

    expect(writes[1]?.values).toEqual(
      expect.objectContaining({
        newValues: expect.objectContaining({
          excessCreditPoisha: 50000,
        }),
      }),
    );
  });

  it('rejects a missing bill after the lock', async () => {
    const { store, writes, updates } = setup({
      bill: null,
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow('Bill not found');

    expect(writes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'rejects a bill whose status changed to %s',
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

  it('rejects a stale bill total after locking', async () => {
    const { store, writes, updates } = setup({
      bill: makeBill({ totalPoisha: 280000 }),
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow(
      'Bill total changed during correction',
    );

    expect(writes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('propagates an audit write failure', async () => {
    const { store, transaction } = setup({
      failAudit: true,
    });

    await expect(store.applyCorrection(validOperation)).rejects.toThrow('Audit write failed');

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
