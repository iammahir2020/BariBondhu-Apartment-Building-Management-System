/**
 * Tests for excess bill credit application.
 *
 * BB-0508, BR-07, NFR-26, NFR-27.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { auditLogs, billLineItems } from '@/models';
import { applyExcessBillCredits } from './applyExcessBillCredits';

type BillTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const TARGET_ID = '123e4567-e89b-42d3-a456-426614174001';
const SOURCE_ID = '123e4567-e89b-42d3-a456-426614174002';
const FLAT_ID = '123e4567-e89b-42d3-a456-426614174003';
const OCCUPANCY_ID = '123e4567-e89b-42d3-a456-426614174004';
const MANAGER_ID = '123e4567-e89b-42d3-a456-426614174005';

interface Options {
  targetTotal?: number;
  sourceTotal?: number;
  sourceAlreadyUsed?: boolean;
  sourceOccupancyId?: string;
}

function makeTransaction(options: Options = {}) {
  const target = {
    id: TARGET_ID,
    flatId: FLAT_ID,
    occupancyId: OCCUPANCY_ID,
    billingMonth: '2026-12-01',
    status: 'Unpaid' as const,
    totalPoisha: options.targetTotal ?? 50000,
  };

  const source = {
    id: SOURCE_ID,
    flatId: FLAT_ID,
    occupancyId: options.sourceOccupancyId ?? OCCUPANCY_ID,
    billingMonth: '2026-11-01',
    status: 'Paid' as const,
    totalPoisha: options.sourceTotal ?? -10000,
  };

  // Simulated results of the four database reads.
  const responses: unknown[][] = [
    [target],
    [source],
    [target, source],
    options.sourceAlreadyUsed ? [{ sourceBillId: SOURCE_ID }] : [],
  ];

  const inserted: {
    table: unknown;
    value: unknown;
  }[] = [];

  const updated: unknown[] = [];

  const select = jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(async () => responses.shift() ?? []),
    })),
  }));

  const insert = jest.fn((table: unknown) => ({
    values: jest.fn(async (value: unknown) => {
      inserted.push({ table, value });
    }),
  }));

  const update = jest.fn((_table: unknown) => {
    void _table;

    return {
      set: jest.fn((value: unknown) => ({
        where: jest.fn(async () => {
          updated.push(value);
        }),
      })),
    };
  });

  const execute = jest.fn().mockResolvedValue(undefined);

  const tx = {
    select,
    insert,
    update,
    execute,
  } as unknown as BillTransaction;

  return {
    tx,
    inserted,
    updated,
    execute,
  };
}

describe('applyExcessBillCredits (BB-0508)', () => {
  it('applies an unused credit to the next bill', async () => {
    const db = makeTransaction();

    const applied = await applyExcessBillCredits(db.tx, TARGET_ID, MANAGER_ID);

    expect(applied).toBe(10000);

    expect(db.updated).toHaveLength(1);
    expect(db.updated[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 40000,
        status: 'Unpaid',
      }),
    );

    expect(db.inserted[0]).toEqual({
      table: billLineItems,
      value: expect.objectContaining({
        billId: TARGET_ID,
        sourceBillId: SOURCE_ID,
        type: 'credit',
        amountPoisha: -10000,
      }),
    });

    expect(db.inserted[1]).toEqual({
      table: auditLogs,
      value: expect.objectContaining({
        actorId: MANAGER_ID,
        action: 'bill.credit_apply',
      }),
    });
  });

  it('does not apply an already-used credit again', async () => {
    const db = makeTransaction({
      sourceAlreadyUsed: true,
    });

    const applied = await applyExcessBillCredits(db.tx, TARGET_ID, MANAGER_ID);

    expect(applied).toBe(0);
    expect(db.inserted).toHaveLength(0);
    expect(db.updated).toHaveLength(0);
  });

  it('preserves remaining excess credit as a negative balance', async () => {
    const db = makeTransaction({
      targetTotal: 5000,
      sourceTotal: -10000,
    });

    const applied = await applyExcessBillCredits(db.tx, TARGET_ID, MANAGER_ID);

    expect(applied).toBe(10000);

    expect(db.updated[0]).toEqual(
      expect.objectContaining({
        totalPoisha: -5000,
        status: 'Paid',
      }),
    );
  });

  it('never transfers credit from another occupancy', async () => {
    const db = makeTransaction({
      sourceOccupancyId: '123e4567-e89b-42d3-a456-426614174099',
    });

    const applied = await applyExcessBillCredits(db.tx, TARGET_ID, MANAGER_ID);

    expect(applied).toBe(0);
    expect(db.inserted).toHaveLength(0);
    expect(db.updated).toHaveLength(0);
  });
});
