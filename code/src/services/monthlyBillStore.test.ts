/**
 * Unit tests for BB-0505 monthly bill database store.
 *
 * Tests Drizzle queries and transaction behavior
 * without connecting to the shared database.
 *
 * @author Jannatul Ferdus Nishi
 */

import { db } from '@/lib/db';
import { bills, billLineItems, chargeRates, flats, occupancies } from '@/models';

import { monthlyBillStore } from '@/services/monthlyBillStore';
import type { MonthlyBillDraft } from '@/services/generateMonthlyBills';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  transaction: jest.Mock;
};

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

function setupTransaction(returnedBills: Array<{ id: string } | null>) {
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

  mockedDb.transaction.mockImplementation(
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

describe('monthlyBillStore (BB-0505)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads all flats, including vacant flats', async () => {
    const records = [{ id: 'flat-1' }, { id: 'flat-2' }];

    const from = jest.fn().mockResolvedValue(records);

    mockedDb.select.mockReturnValue({ from });

    const result = await monthlyBillStore.listFlats();

    expect(from).toHaveBeenCalledWith(flats);
    expect(result).toEqual(records);
  });

  it('reads only active occupancies', async () => {
    const records = [{ id: 'occupancy-1', flatId: 'flat-1' }];

    const where = jest.fn().mockResolvedValue(records);
    const from = jest.fn().mockReturnValue({ where });

    mockedDb.select.mockReturnValue({ from });

    const result = await monthlyBillStore.listActiveOccupancies();

    expect(from).toHaveBeenCalledWith(occupancies);
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toEqual(records);
  });

  it('reads only Current charge rates', async () => {
    const records = [{ id: 'rate-1', status: 'Current' }];

    const where = jest.fn().mockResolvedValue(records);
    const from = jest.fn().mockReturnValue({ where });

    mockedDb.select.mockReturnValue({ from });

    const result = await monthlyBillStore.listCurrentRates();

    expect(from).toHaveBeenCalledWith(chargeRates);
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toEqual(records);
  });

  it('does not open a transaction for empty drafts', async () => {
    const result = await monthlyBillStore.createMissing([]);

    expect(result).toEqual([]);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('inserts a bill and its three line items', async () => {
    const mocks = setupTransaction([{ id: 'bill-1' }]);

    const draft = makeDraft();

    const result = await monthlyBillStore.createMissing([draft]);

    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);

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

  it('skips existing bills without inserting line items', async () => {
    const mocks = setupTransaction([null]);

    const result = await monthlyBillStore.createMissing([makeDraft()]);

    expect(result).toEqual([]);

    expect(mocks.insert).toHaveBeenCalledWith(bills);
    expect(mocks.insert).not.toHaveBeenCalledWith(billLineItems);

    expect(mocks.lineItemValues).not.toHaveBeenCalled();
  });

  it('creates multiple bills and skips duplicates', async () => {
    const mocks = setupTransaction([{ id: 'bill-1' }, null, { id: 'bill-3' }]);

    const result = await monthlyBillStore.createMissing([
      makeDraft('flat-1'),
      makeDraft('flat-2'),
      makeDraft('flat-3'),
    ]);

    expect(result).toEqual([{ id: 'bill-1' }, { id: 'bill-3' }]);

    expect(mocks.billValues).toHaveBeenCalledTimes(3);
    expect(mocks.lineItemValues).toHaveBeenCalledTimes(2);
    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not insert line items when none are provided', async () => {
    const mocks = setupTransaction([{ id: 'bill-1' }]);

    const result = await monthlyBillStore.createMissing([makeDraft('flat-1', false)]);

    expect(result).toEqual([{ id: 'bill-1' }]);

    expect(mocks.insert).not.toHaveBeenCalledWith(billLineItems);
  });

  it('propagates transaction failures', async () => {
    setupTransaction([{ id: 'bill-1' }]);

    mockedDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));

    await expect(monthlyBillStore.createMissing([makeDraft()])).rejects.toThrow(
      'Transaction failed',
    );
  });

  it('propagates line-item insertion failures', async () => {
    const mocks = setupTransaction([{ id: 'bill-1' }]);

    mocks.lineItemValues.mockRejectedValueOnce(new Error('Line item insertion failed'));

    await expect(monthlyBillStore.createMissing([makeDraft()])).rejects.toThrow(
      'Line item insertion failed',
    );
  });
});
