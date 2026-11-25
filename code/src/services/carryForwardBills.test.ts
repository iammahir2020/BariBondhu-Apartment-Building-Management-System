/**
 * Unit tests for carrying forward unpaid bills.
 *
 * BB-0506, BR-05, NFR-26.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Bill } from '@/models';

import {
  carryForwardUnpaidBills,
  type CarryForwardOperation,
  type CarryForwardStore,
} from '@/services/carryForwardBills';

const TARGET_MONTH = '2026-11-01';
const PREVIOUS_MONTH = '2026-10-01';

function makeBill(changes: Partial<Bill> = {}): Bill {
  return {
    id: 'old-bill-1',
    flatId: 'flat-1',
    occupancyId: 'household-1',
    billingMonth: PREVIOUS_MONTH,
    dueDate: '2026-10-20',
    totalPoisha: 200000,
    status: 'Unpaid',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    ...changes,
  };
}

function setup(targetChanges: Partial<Bill> = {}, earlierBills: Bill[] = [makeBill()]) {
  const target = makeBill({
    id: 'new-bill',
    billingMonth: TARGET_MONTH,
    dueDate: '2026-11-20',
    totalPoisha: 300000,
    ...targetChanges,
  });

  const findBillById = jest.fn<Promise<Bill | undefined>, [string]>().mockResolvedValue(target);

  const listEarlierBills = jest
    .fn<Promise<Bill[]>, [string, string]>()
    .mockResolvedValue(earlierBills);

  const applyCarryForward = jest
    .fn<Promise<number>, [CarryForwardOperation]>()
    .mockResolvedValue(
      earlierBills.filter(
        (bill) =>
          bill.status === 'Unpaid' &&
          bill.occupancyId === target.occupancyId &&
          bill.flatId === target.flatId &&
          bill.billingMonth < target.billingMonth &&
          bill.totalPoisha > 0,
      ).length,
    );

  const store: CarryForwardStore = {
    findBillById,
    listEarlierBills,
    applyCarryForward,
  };

  return {
    store,
    target,
    findBillById,
    listEarlierBills,
    applyCarryForward,
  };
}

describe('carryForwardUnpaidBills (BB-0506)', () => {
  it('carries forward an earlier Unpaid bill', async () => {
    const { store, applyCarryForward } = setup();

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result).toEqual({
      targetBillId: 'new-bill',
      carriedCount: 1,
      carriedAmountPoisha: 200000,
    });

    expect(applyCarryForward).toHaveBeenCalledWith({
      targetBillId: 'new-bill',
      sources: [
        {
          sourceBillId: 'old-bill-1',
          amountPoisha: 200000,
        },
      ],
    });
  });

  it('carries multiple earlier Unpaid bills', async () => {
    const earlier = [
      makeBill(),
      makeBill({
        id: 'old-bill-2',
        billingMonth: '2026-09-01',
        totalPoisha: 150000,
      }),
    ];

    const { store, applyCarryForward } = setup({}, earlier);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(2);
    expect(result.carriedAmountPoisha).toBe(350000);

    expect(applyCarryForward).toHaveBeenCalledWith({
      targetBillId: 'new-bill',
      sources: expect.arrayContaining([
        {
          sourceBillId: 'old-bill-1',
          amountPoisha: 200000,
        },
        {
          sourceBillId: 'old-bill-2',
          amountPoisha: 150000,
        },
      ]),
    });
  });

  it('does not carry a previous household debt', async () => {
    const { store, applyCarryForward } = setup({}, [
      makeBill({
        occupancyId: 'previous-household',
      }),
    ]);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('does not carry a debt from another flat', async () => {
    const { store, applyCarryForward } = setup({}, [makeBill({ flatId: 'another-flat' })]);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'does not carry an earlier %s bill',
    async (status) => {
      const { store, applyCarryForward } = setup({}, [makeBill({ status })]);

      const result = await carryForwardUnpaidBills({ store }, 'new-bill');

      expect(result.carriedCount).toBe(0);
      expect(applyCarryForward).not.toHaveBeenCalled();
    },
  );

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'does not modify a target in %s status',
    async (status) => {
      const { store, applyCarryForward, listEarlierBills } = setup({ status });

      const result = await carryForwardUnpaidBills({ store }, 'new-bill');

      expect(result.carriedCount).toBe(0);
      expect(listEarlierBills).not.toHaveBeenCalled();
      expect(applyCarryForward).not.toHaveBeenCalled();
    },
  );

  it('does not transfer debt to a vacant flat', async () => {
    const { store, applyCarryForward } = setup({
      occupancyId: null,
    });

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('does not carry bills from the same month', async () => {
    const { store, applyCarryForward } = setup({}, [makeBill({ billingMonth: TARGET_MONTH })]);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('does not carry bills from a future month', async () => {
    const { store, applyCarryForward } = setup({}, [makeBill({ billingMonth: '2026-12-01' })]);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('does not transfer zero-value debt', async () => {
    const { store, applyCarryForward } = setup({}, [makeBill({ totalPoisha: 0 })]);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result.carriedCount).toBe(0);
    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('rejects negative unpaid balances', async () => {
    const { store, applyCarryForward } = setup({}, [makeBill({ totalPoisha: -100 })]);

    await expect(carryForwardUnpaidBills({ store }, 'new-bill')).rejects.toThrow(
      'Invalid unpaid bill balance',
    );

    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('rejects duplicate source bill records', async () => {
    const oldBill = makeBill();

    const { store, applyCarryForward } = setup({}, [oldBill, oldBill]);

    await expect(carryForwardUnpaidBills({ store }, 'new-bill')).rejects.toThrow(
      'Duplicate source bill found',
    );

    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('rejects amounts exceeding PostgreSQL integer bounds', async () => {
    const { store, applyCarryForward } = setup({ totalPoisha: 2147483640 }, [
      makeBill({ totalPoisha: 200000 }),
    ]);

    await expect(carryForwardUnpaidBills({ store }, 'new-bill')).rejects.toThrow(
      'The carried-forward amount is too large',
    );

    expect(applyCarryForward).not.toHaveBeenCalled();
  });

  it('throws when the target bill is missing', async () => {
    const { store, findBillById } = setup();

    findBillById.mockResolvedValue(undefined);

    await expect(carryForwardUnpaidBills({ store }, 'missing-bill')).rejects.toThrow(
      'Bill not found',
    );
  });

  it('detects incomplete transfers', async () => {
    const { store, applyCarryForward } = setup();

    applyCarryForward.mockResolvedValue(0);

    await expect(carryForwardUnpaidBills({ store }, 'new-bill')).rejects.toThrow(
      'The unpaid bills changed during carry forward',
    );
  });

  it('returns zero when there are no earlier bills', async () => {
    const { store, applyCarryForward } = setup({}, []);

    const result = await carryForwardUnpaidBills({ store }, 'new-bill');

    expect(result).toEqual({
      targetBillId: 'new-bill',
      carriedCount: 0,
      carriedAmountPoisha: 0,
    });

    expect(applyCarryForward).not.toHaveBeenCalled();
  });
});
