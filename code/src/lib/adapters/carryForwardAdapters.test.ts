/**
 * Tests for the carry-forward database adapter.
 * BB-0506, BR-05, NFR-26, NFR-27.
 *
 * Uses a mocked Drizzle transaction.
 * Actual PostgreSQL rollback and concurrency
 * require integration testing.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { auditLogs, billLineItems, type Bill } from '@/models';

import { databaseCarryForwardStore } from './carryForwardAdapters';

import type { CarryForwardOperation } from '@/services/carryForwardBills';

function makeBill(changes: Partial<Bill> = {}): Bill {
  return {
    id: 'old-bill-1',
    flatId: 'flat-1',
    occupancyId: 'household-1',
    billingMonth: '2026-10-01',
    dueDate: '2026-10-20',
    totalPoisha: 200000,
    status: 'Unpaid',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    ...changes,
  };
}

const operation: CarryForwardOperation = {
  targetBillId: 'new-bill',
  sources: [
    {
      sourceBillId: 'old-bill-1',
      amountPoisha: 200000,
    },
  ],
};

interface HarnessOptions {
  target?: Bill | null;
  sources?: Bill[];
  newerBills?: { id: string }[];
  existingLines?: {
    sourceBillId: string | null;
  }[];
  failAudit?: boolean;
}

function setup(options: HarnessOptions = {}) {
  const target =
    options.target === undefined
      ? makeBill({
          id: 'new-bill',
          billingMonth: '2026-11-01',
          dueDate: '2026-11-20',
          totalPoisha: 300000,
        })
      : options.target;

  const selectResults: unknown[][] = [
    target ? [target] : [],
    options.newerBills ?? [],
    options.sources ?? [makeBill()],
    options.existingLines ?? [],
  ];

  const writes: Array<{
    table: unknown;
    values: unknown;
  }> = [];

  const updates: unknown[] = [];

  const execute = jest.fn().mockResolvedValue([]);

  const select = jest.fn(() => {
    const rows = selectResults.shift() ?? [];

    const result = Object.assign(Promise.resolve(rows), {
      limit: jest.fn().mockResolvedValue(rows),
    });

    return {
      from: jest.fn(() => ({
        where: jest.fn(() => result),
      })),
    };
  });

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

  const transaction = jest.fn(async (callback: (transaction: typeof tx) => Promise<number>) =>
    callback(tx),
  );

  const db = {
    transaction,
  } as unknown as Database;

  return {
    store: databaseCarryForwardStore(db),
    transaction,
    execute,
    writes,
    updates,
  };
}

describe('databaseCarryForwardStore (BB-0506)', () => {
  it('locks rows and saves line items and bill updates', async () => {
    const { store, transaction, execute, writes, updates } = setup();

    const result = await store.applyCarryForward(operation);

    expect(result).toBe(1);

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(execute).toHaveBeenCalledTimes(1);

    expect(writes[0]).toEqual({
      table: billLineItems,
      values: [
        expect.objectContaining({
          billId: 'new-bill',
          type: 'carried_forward',
          amountPoisha: 200000,
          sourceBillId: 'old-bill-1',
        }),
      ],
    });

    expect(updates).toHaveLength(2);

    expect(updates[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 500000,
      }),
    );

    expect(updates[1]).toEqual(
      expect.objectContaining({
        status: 'Carried forward',
      }),
    );
  });

  it('writes audit entries for source and target', async () => {
    const { store, writes, transaction } = setup();

    await store.applyCarryForward(operation);

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(writes).toHaveLength(2);

    expect(writes[1]?.table).toBe(auditLogs);

    expect(writes[1]?.values).toEqual([
      expect.objectContaining({
        actorId: null,
        action: 'bill.carry_forward',
        entityId: 'old-bill-1',
        oldValues: {
          status: 'Unpaid',
          totalPoisha: 200000,
        },
        newValues: expect.objectContaining({
          status: 'Carried forward',
          targetBillId: 'new-bill',
          amountPoisha: 200000,
        }),
      }),
      expect.objectContaining({
        actorId: null,
        action: 'bill.carry_forward',
        entityId: 'new-bill',
        oldValues: {
          status: 'Unpaid',
          totalPoisha: 300000,
        },
        newValues: expect.objectContaining({
          totalPoisha: 500000,
        }),
      }),
    ]);
  });

  it('writes audit entries for multiple sources', async () => {
    const { store, writes } = setup({
      sources: [
        makeBill(),
        makeBill({
          id: 'old-bill-2',
          totalPoisha: 150000,
        }),
      ],
    });

    const result = await store.applyCarryForward({
      targetBillId: 'new-bill',
      sources: [
        {
          sourceBillId: 'old-bill-1',
          amountPoisha: 200000,
        },
        {
          sourceBillId: 'old-bill-2',
          amountPoisha: 150000,
        },
      ],
    });

    expect(result).toBe(2);

    expect(writes[1]?.values as unknown[]).toHaveLength(3);
  });

  it('does nothing when there are no sources', async () => {
    const { store, transaction } = setup();

    const result = await store.applyCarryForward({
      targetBillId: 'new-bill',
      sources: [],
    });

    expect(result).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate source IDs', async () => {
    const { store, transaction } = setup();

    await expect(
      store.applyCarryForward({
        ...operation,
        sources: [operation.sources[0]!, operation.sources[0]!],
      }),
    ).rejects.toThrow('Duplicate or invalid source bill');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects the target as a source', async () => {
    const { store, transaction } = setup();

    await expect(
      store.applyCarryForward({
        targetBillId: 'new-bill',
        sources: [
          {
            sourceBillId: 'new-bill',
            amountPoisha: 200000,
          },
        ],
      }),
    ).rejects.toThrow('Duplicate or invalid source bill');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing target bill', async () => {
    const { store, writes, updates } = setup({ target: null });

    await expect(store.applyCarryForward(operation)).rejects.toThrow('Bill not found');

    expect(writes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'rejects a target that changed to %s',
    async (status) => {
      const { store, writes } = setup({
        target: makeBill({
          id: 'new-bill',
          status,
        }),
      });

      await expect(store.applyCarryForward(operation)).rejects.toThrow(
        'Target bill is not available for carry forward',
      );

      expect(writes).toHaveLength(0);
    },
  );

  it('rejects a vacant target', async () => {
    const { store, writes } = setup({
      target: makeBill({
        id: 'new-bill',
        occupancyId: null,
      }),
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Target bill is not available for carry forward',
    );

    expect(writes).toHaveLength(0);
  });

  it('rejects a target that is no longer newest', async () => {
    const { store, writes } = setup({
      newerBills: [{ id: 'december-bill' }],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Carry forward requires the newest bill',
    );

    expect(writes).toHaveLength(0);
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'rejects a source changed to %s',
    async (status) => {
      const { store, writes } = setup({
        sources: [makeBill({ status })],
      });

      await expect(store.applyCarryForward(operation)).rejects.toThrow(
        'Source bill is no longer eligible',
      );

      expect(writes).toHaveLength(0);
    },
  );

  it('rejects a changed source balance', async () => {
    const { store, writes } = setup({
      sources: [
        makeBill({
          totalPoisha: 100000,
        }),
      ],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Source bill amount has changed',
    );

    expect(writes).toHaveLength(0);
  });

  it('rejects a previously carried source', async () => {
    const { store, writes } = setup({
      existingLines: [
        {
          sourceBillId: 'old-bill-1',
        },
      ],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Bill was already carried forward',
    );

    expect(writes).toHaveLength(0);
  });

  it('rejects missing source bills', async () => {
    const { store, writes } = setup({
      sources: [],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'One or more source bills are missing',
    );

    expect(writes).toHaveLength(0);
  });

  it('propagates audit failure', async () => {
    const { store, writes } = setup({
      failAudit: true,
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow('Audit write failed');

    expect(writes[1]?.table).toBe(auditLogs);
  });
});
