/**
 * Database adapter tests for carrying forward unpaid bills.
 *
 * BB-0506, BR-05, NFR-26.
 *
 * These tests use a mocked Drizzle transaction.
 * PostgreSQL concurrency and rollback require integration tests.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import type { Bill } from '@/models';

import { databaseCarryForwardStore } from '@/lib/adapters/carryForwardAdapters';
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
  existingLines?: { sourceBillId: string | null }[];
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

  const previousBills = options.sources ?? [makeBill()];

  // Query order inside applyCarryForward:
  // 1. Target bill
  // 2. Newer bill check
  // 3. Source bills
  // 4. Existing carried-forward references
  const selectResults: unknown[][] = [
    target ? [target] : [],
    options.newerBills ?? [],
    previousBills,
    options.existingLines ?? [],
  ];

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

  const insertValues = jest.fn().mockResolvedValue([]);
  const insert = jest.fn(() => ({
    values: insertValues,
  }));

  const updateWhere = jest.fn().mockResolvedValue([]);
  const updateSet = jest.fn(() => ({
    where: updateWhere,
  }));
  const update = jest.fn(() => ({
    set: updateSet,
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
    select,
    insert,
    insertValues,
    update,
    updateSet,
  };
}

describe('databaseCarryForwardStore (BB-0506)', () => {
  it('transfers an eligible unpaid bill in a transaction', async () => {
    const { store, transaction, execute, insertValues, updateSet } = setup();

    const result = await store.applyCarryForward(operation);

    expect(result).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);

    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        billId: 'new-bill',
        type: 'carried_forward',
        amountPoisha: 200000,
        sourceBillId: 'old-bill-1',
      }),
    ]);

    expect(updateSet).toHaveBeenCalledTimes(2);

    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        totalPoisha: 500000,
      }),
    );

    expect(updateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'Carried forward',
      }),
    );
  });

  it('does nothing when no source bills are supplied', async () => {
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
        targetBillId: 'new-bill',
        sources: [operation.sources[0]!, operation.sources[0]!],
      }),
    ).rejects.toThrow('Duplicate or invalid source bill');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects using the target as a source', async () => {
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
    const { store, insertValues, updateSet } = setup({
      target: null,
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow('Bill not found');

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'refuses a target with status %s',
    async (status) => {
      const { store, insertValues, updateSet } = setup({
        target: makeBill({
          id: 'new-bill',
          billingMonth: '2026-11-01',
          status,
        }),
      });

      await expect(store.applyCarryForward(operation)).rejects.toThrow(
        'Target bill is not available for carry forward',
      );

      expect(insertValues).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
    },
  );

  it('rejects a vacant target bill', async () => {
    const { store, insertValues } = setup({
      target: makeBill({
        id: 'new-bill',
        billingMonth: '2026-11-01',
        occupancyId: null,
      }),
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Target bill is not available for carry forward',
    );

    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses carrying debt into a bill that is not newest', async () => {
    const { store, insertValues, updateSet } = setup({
      newerBills: [{ id: 'december-bill' }],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Carry forward requires the newest bill',
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a previous household debt', async () => {
    const { store, insertValues, updateSet } = setup({
      sources: [
        makeBill({
          occupancyId: 'previous-household',
        }),
      ],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Source bill is no longer eligible',
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a source belonging to another flat', async () => {
    const { store, insertValues } = setup({
      sources: [makeBill({ flatId: 'another-flat' })],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Source bill is no longer eligible',
    );

    expect(insertValues).not.toHaveBeenCalled();
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'rejects a source that changed to %s',
    async (status) => {
      const { store, insertValues } = setup({
        sources: [makeBill({ status })],
      });

      await expect(store.applyCarryForward(operation)).rejects.toThrow(
        'Source bill is no longer eligible',
      );

      expect(insertValues).not.toHaveBeenCalled();
    },
  );

  it('rejects a source bill whose amount changed', async () => {
    const { store, insertValues, updateSet } = setup({
      sources: [
        makeBill({
          totalPoisha: 150000,
        }),
      ],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Source bill amount has changed',
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a previously carried source reference', async () => {
    const { store, insertValues, updateSet } = setup({
      existingLines: [
        {
          sourceBillId: 'old-bill-1',
        },
      ],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'Bill was already carried forward',
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects totals exceeding PostgreSQL integer bounds', async () => {
    const { store, insertValues, updateSet } = setup({
      target: makeBill({
        id: 'new-bill',
        billingMonth: '2026-11-01',
        totalPoisha: 2147483640,
      }),
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'The carried-forward amount is too large',
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects missing source bill records', async () => {
    const { store, insertValues } = setup({
      sources: [],
    });

    await expect(store.applyCarryForward(operation)).rejects.toThrow(
      'One or more source bills are missing',
    );

    expect(insertValues).not.toHaveBeenCalled();
  });
});
