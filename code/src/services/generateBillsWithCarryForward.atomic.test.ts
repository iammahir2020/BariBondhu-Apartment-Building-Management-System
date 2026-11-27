/**
 * Atomic generation tests.
 * BB-0508, BR-05, NFR-26, NFR-27.
 */

import type { Database } from '@/lib/db';
import { auditLogs } from '@/models';
import { generateBillsWithCarryForward } from './generateBillsWithCarryForward';

const monthlyStore = {};
const carryStore = {};

const mockMonthlyFactory = jest.fn((...args: unknown[]) => {
  void args;
  return monthlyStore;
});

const mockCarryFactory = jest.fn((...args: unknown[]) => {
  void args;
  return carryStore;
});

const mockGenerate = jest.fn();
const mockCarry = jest.fn();
const mockCredit = jest.fn();

jest.mock('@/lib/adapters/billAdapters', () => ({
  databaseMonthlyBillStore: (...args: unknown[]) => mockMonthlyFactory(...args),
}));

jest.mock('@/lib/adapters/carryForwardAdapters', () => ({
  databaseCarryForwardStore: (...args: unknown[]) => mockCarryFactory(...args),
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

const bill = {
  id: 'bill-1',
  totalPoisha: 50000,
};

describe('BB-0508 atomic monthly generation', () => {
  let tx: {
    execute: jest.Mock;
    insert: jest.Mock;
    select: jest.Mock;
  };

  let transaction: jest.Mock;
  let db: Database;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([bill]),
        })),
      })),
    };

    transaction = jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));

    db = { transaction } as unknown as Database;

    mockGenerate.mockResolvedValue({
      billingMonth: input.billingMonth,
      createdCount: 1,
      skippedCount: 0,
      bills: [bill],
    });

    mockCarry.mockResolvedValue({
      carriedCount: 0,
      carriedAmountPoisha: 0,
    });

    mockCredit.mockResolvedValue(0);
  });

  it('shares one transaction across adapters', async () => {
    await generateBillsWithCarryForward(db, input, 'manager-1');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mockMonthlyFactory).toHaveBeenCalledWith(db, tx);
    expect(mockCarryFactory).toHaveBeenCalledWith(db, tx, 'manager-1');
    expect(mockCredit).toHaveBeenCalledWith(tx, bill.id, 'manager-1');
  });

  it('propagates carry-forward failure', async () => {
    mockCarry.mockRejectedValueOnce(new Error('Carry forward failed'));

    await expect(generateBillsWithCarryForward(db, input, 'manager-1')).rejects.toThrow(
      'Carry forward failed',
    );

    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('rejects partially generated bills', async () => {
    mockGenerate.mockResolvedValueOnce({
      billingMonth: input.billingMonth,
      createdCount: 1,
      skippedCount: 1,
      bills: [bill],
    });

    await expect(generateBillsWithCarryForward(db, input, 'manager-1')).rejects.toThrow(
      'Some monthly bills already exist',
    );

    expect(mockCarry).not.toHaveBeenCalled();
    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('uses the shared transaction for generation audit', async () => {
    const auditEntry = {
      actorId: 'manager-1',
      action: 'bill.generate',
      entityType: 'bills',
      entityId: bill.id,
    };

    const values = jest.fn().mockResolvedValue(undefined);
    tx.insert.mockReturnValue({ values });

    mockGenerate.mockImplementationOnce(
      async (deps: { audit: (entry: unknown) => Promise<void> }) => {
        await deps.audit(auditEntry);
        return {
          billingMonth: input.billingMonth,
          createdCount: 1,
          skippedCount: 0,
          bills: [bill],
        };
      },
    );

    await generateBillsWithCarryForward(db, input, 'manager-1');

    expect(tx.insert).toHaveBeenCalledWith(auditLogs);
    expect(values).toHaveBeenCalledWith(auditEntry);
  });
});
