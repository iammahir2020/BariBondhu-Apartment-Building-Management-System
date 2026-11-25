/**
 * Tests for the BB-0505 monthly bill database adapter.
 *
 * Uses a mocked Drizzle database. Does not access
 * the shared Supabase database.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { bills, billLineItems, chargeRates, flats, occupancies } from '@/models';
import { databaseMonthlyBillStore } from '@/lib/adapters/billAdapters';
import type { MonthlyBillDraft } from '@/services/generateMonthlyBills';

function makeDraft(flatId = 'flat-1', withLineItems = true): MonthlyBillDraft {
  return {
    bill: {
      flatId,
      occupancyId: null,
      billingMonth: '2026-11-01',
      dueDate: '2026-11-20',
      totalPoisha: 800000,
      status: 'Unpaid',
    },
    lineItems: withLineItems
      ? [
          {
            type: 'service',
            amountPoisha: 500000,
            description: null,
            sourceBillId: null,
          },
          {
            type: 'generator',
            amountPoisha: 200000,
            description: null,
            sourceBillId: null,
          },
          {
            type: 'water',
            amountPoisha: 100000,
            description: null,
            sourceBillId: null,
          },
        ]
      : [],
  };
}

function setup() {
  const select = jest.fn();
  const transaction = jest.fn();

  const mockDb = {
    select,
    transaction,
  };

  const store = databaseMonthlyBillStore(mockDb as unknown as Database);

  return { store, select, transaction };
}

function setupTransaction(transaction: jest.Mock, returnedBills: Array<{ id: string } | null>) {
  const returning = jest.fn();

  for (const bill of returnedBills) {
    returning.mockResolvedValueOnce(bill ? [bill] : []);
  }

  const onConflictDoNothing = jest.fn(() => ({
    returning,
  }));

  const billValues = jest.fn(() => ({
    onConflictDoNothing,
  }));

  const lineItemValues = jest.fn().mockResolvedValue([]);

  const insert = jest.fn((table) => {
    if (table === bills) {
      return { values: billValues };
    }

    if (table === billLineItems) {
      return { values: lineItemValues };
    }

    throw new Error('Unexpected table');
  });

  transaction.mockImplementation(
    async (callback: (tx: { insert: typeof insert }) => Promise<unknown>) => callback({ insert }),
  );

  return {
    insert,
    returning,
    onConflictDoNothing,
    billValues,
    lineItemValues,
  };
}

describe('databaseMonthlyBillStore (BB-0505)', () => {
  it('reads all flats', async () => {
    const { store, select } = setup();

    const records = [{ id: 'flat-1' }, { id: 'flat-2' }];

    const from = jest.fn().mockResolvedValue(records);
    select.mockReturnValue({ from });

    const result = await store.listFlats();

    expect(from).toHaveBeenCalledWith(flats);
    expect(result).toEqual(records);
  });

  it('reads active occupancies', async () => {
    const { store, select } = setup();

    const records = [{ id: 'occupancy-1' }];

    const where = jest.fn().mockResolvedValue(records);
    const from = jest.fn().mockReturnValue({ where });

    select.mockReturnValue({ from });

    const result = await store.listActiveOccupancies();

    expect(from).toHaveBeenCalledWith(occupancies);
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toEqual(records);
  });

  it('reads Current charge rates', async () => {
    const { store, select } = setup();

    const records = [{ id: 'rate-1', status: 'Current' }];

    const where = jest.fn().mockResolvedValue(records);
    const from = jest.fn().mockReturnValue({ where });

    select.mockReturnValue({ from });

    const result = await store.listCurrentRates();

    expect(from).toHaveBeenCalledWith(chargeRates);
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toEqual(records);
  });

  it('detects a month with existing bills', async () => {
    const { store, select } = setup();

    const limit = jest.fn().mockResolvedValue([{ id: 'bill-1' }]);

    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });

    select.mockReturnValue({ from });

    const result = await store.monthHasBills('2026-11-01');

    expect(from).toHaveBeenCalledWith(bills);
    expect(where).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(result).toBe(true);
  });

  it('detects a month without existing bills', async () => {
    const { store, select } = setup();

    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });

    select.mockReturnValue({ from });

    expect(await store.monthHasBills('2026-11-01')).toBe(false);
  });

  it('does not open a transaction for empty drafts', async () => {
    const { store, transaction } = setup();

    expect(await store.createMissing([])).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saves a bill and its three line items', async () => {
    const { store, transaction } = setup();

    const mocks = setupTransaction(transaction, [{ id: 'bill-1' }]);

    const draft = makeDraft();

    const result = await store.createMissing([draft]);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(bills);
    expect(mocks.insert).toHaveBeenCalledWith(billLineItems);

    expect(mocks.billValues).toHaveBeenCalledWith(draft.bill);

    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [bills.flatId, bills.billingMonth],
    });

    expect(mocks.lineItemValues).toHaveBeenCalledWith(
      draft.lineItems.map((item) => ({
        ...item,
        billId: 'bill-1',
      })),
    );

    expect(result).toEqual([{ id: 'bill-1' }]);
  });

  it('skips a duplicate insert during a concurrent run', async () => {
    const { store, transaction } = setup();

    const mocks = setupTransaction(transaction, [null]);

    expect(await store.createMissing([makeDraft()])).toEqual([]);

    expect(mocks.insert).toHaveBeenCalledWith(bills);

    expect(mocks.insert).not.toHaveBeenCalledWith(billLineItems);
  });

  it('creates multiple bills and skips insert conflicts', async () => {
    const { store, transaction } = setup();

    const mocks = setupTransaction(transaction, [{ id: 'bill-1' }, null, { id: 'bill-3' }]);

    const result = await store.createMissing([
      makeDraft('flat-1'),
      makeDraft('flat-2'),
      makeDraft('flat-3'),
    ]);

    expect(result).toEqual([{ id: 'bill-1' }, { id: 'bill-3' }]);

    expect(mocks.billValues).toHaveBeenCalledTimes(3);
    expect(mocks.lineItemValues).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('handles an empty line-item list', async () => {
    const { store, transaction } = setup();

    const mocks = setupTransaction(transaction, [{ id: 'bill-1' }]);

    const result = await store.createMissing([makeDraft('flat-1', false)]);

    expect(result).toEqual([{ id: 'bill-1' }]);

    expect(mocks.insert).not.toHaveBeenCalledWith(billLineItems);
  });

  it('propagates transaction errors', async () => {
    const { store, transaction } = setup();

    transaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(store.createMissing([makeDraft()])).rejects.toThrow('Transaction failed');
  });

  it('propagates line-item insertion errors', async () => {
    const { store, transaction } = setup();

    const mocks = setupTransaction(transaction, [{ id: 'bill-1' }]);

    mocks.lineItemValues.mockRejectedValueOnce(new Error('Line item insertion failed'));

    await expect(store.createMissing([makeDraft()])).rejects.toThrow('Line item insertion failed');
  });
});
