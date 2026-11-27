/**
 * Credit integration tests for atomic bill generation.
 * BB-0508, BR-07, NFR-26.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Database } from '@/lib/db';
import { generateBillsWithCarryForward } from './generateBillsWithCarryForward';

const mockGenerate = jest.fn();
const mockCarry = jest.fn();
const mockCredit = jest.fn();

jest.mock('@/lib/adapters/billAdapters', () => ({
  databaseMonthlyBillStore: () => ({}),
}));

jest.mock('@/lib/adapters/carryForwardAdapters', () => ({
  databaseCarryForwardStore: () => ({}),
}));

jest.mock('@/services/generateMonthlyBills', () => ({
  generateMonthlyBills: (...args: unknown[]) => mockGenerate(...args),
}));

jest.mock('@/services/carryForwardBills', () => ({
  carryForwardUnpaidBills: (...args: unknown[]) => mockCarry(...args),
}));

jest.mock('@/services/applyExcessBillCredits', () => ({
  applyExcessBillCredits: (...args: unknown[]) => mockCredit(...args),
}));

const input = {
  billingMonth: '2026-12-01',
  dueDate: '2026-12-20',
};

describe('BB-0508 credit transaction integration', () => {
  let tx: {
    execute: jest.Mock;
    insert: jest.Mock;
    select: jest.Mock;
  };

  let transaction: jest.Mock;
  let db: Database;

  beforeEach(() => {
    mockGenerate.mockReset();
    mockCarry.mockReset();
    mockCredit.mockReset();

    tx = {
      execute: jest.fn().mockResolvedValue(undefined),

      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),

      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([
            {
              id: 'bill-1',
              totalPoisha: 40000,
            },
          ]),
        })),
      })),
    };

    transaction = jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));

    db = {
      transaction,
    } as unknown as Database;

    mockGenerate.mockResolvedValue({
      billingMonth: '2026-12-01',
      createdCount: 1,
      skippedCount: 0,
      bills: [
        {
          id: 'bill-1',
          totalPoisha: 50000,
        },
      ],
    });

    mockCarry.mockResolvedValue({
      carriedCount: 0,
      carriedAmountPoisha: 0,
    });

    mockCredit.mockResolvedValue(10000);
  });

  it('applies credit in the shared transaction', async () => {
    const result = await generateBillsWithCarryForward(db, input, 'manager-1');

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(mockCredit).toHaveBeenCalledWith(tx, 'bill-1', 'manager-1');

    expect(result.bills[0]).toEqual(
      expect.objectContaining({
        totalPoisha: 40000,
      }),
    );
  });

  it('applies carry forward before credit', async () => {
    await generateBillsWithCarryForward(db, input, 'manager-1');

    expect(mockCarry).toHaveBeenCalledTimes(1);
    expect(mockCredit).toHaveBeenCalledTimes(1);

    const carryOrder = mockCarry.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;

    const creditOrder = mockCredit.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;

    expect(carryOrder).toBeLessThan(creditOrder);
  });

  it('propagates credit failure', async () => {
    mockCredit.mockRejectedValueOnce(new Error('Credit application failed'));

    await expect(generateBillsWithCarryForward(db, input, 'manager-1')).rejects.toThrow(
      'Credit application failed',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('does not apply credit if carry forward fails', async () => {
    mockCarry.mockRejectedValueOnce(new Error('Carry forward failed'));

    await expect(generateBillsWithCarryForward(db, input, 'manager-1')).rejects.toThrow(
      'Carry forward failed',
    );

    expect(mockCredit).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
