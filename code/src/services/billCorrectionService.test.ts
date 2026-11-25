/**
 * Unit tests for unpaid bill correction.
 *
 * BB-0507, BM-03, BR-07, NFR-27.
 *
 * @author Jannatul Ferdus Nishi
 */

import type { Bill } from '@/models';

import {
  correctUnpaidBill,
  type BillCorrectionInput,
  type BillCorrectionOperation,
  type BillCorrectionResult,
  type BillCorrectionStore,
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

const validInput: BillCorrectionInput = {
  billId: 'bill-1',
  managerId: 'manager-1',
  adjustmentPoisha: -50000,
  reason: 'Incorrect generator charge',
};

function setup(bill: Bill | undefined = makeBill()) {
  const findBillById = jest.fn<Promise<Bill | undefined>, [string]>().mockResolvedValue(bill);

  const applyCorrection = jest.fn<Promise<BillCorrectionResult>, [BillCorrectionOperation]>();

  applyCorrection.mockImplementation(async (operation) => ({
    billId: operation.billId,
    previousTotalPoisha: operation.expectedTotalPoisha,
    newTotalPoisha: operation.newTotalPoisha,
    adjustmentPoisha: operation.adjustmentPoisha,
    excessCreditPoisha: operation.excessCreditPoisha,
    status: operation.newStatus,
  }));

  const store: BillCorrectionStore = {
    findBillById,
    applyCorrection,
  };

  return {
    store,
    findBillById,
    applyCorrection,
  };
}

describe('correctUnpaidBill (BB-0507)', () => {
  it('reduces an Unpaid bill using a negative adjustment', async () => {
    const { store, applyCorrection } = setup();

    const result = await correctUnpaidBill({ store }, validInput);

    expect(result).toEqual({
      billId: 'bill-1',
      previousTotalPoisha: 300000,
      newTotalPoisha: 250000,
      adjustmentPoisha: -50000,
      excessCreditPoisha: 0,
      status: 'Unpaid',
    });

    expect(applyCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        billId: 'bill-1',
        managerId: 'manager-1',
        reason: 'Incorrect generator charge',
        expectedTotalPoisha: 300000,
        newTotalPoisha: 250000,
        newStatus: 'Unpaid',
      }),
    );
  });

  it('increases an Unpaid bill using a positive adjustment', async () => {
    const { store } = setup();

    const result = await correctUnpaidBill(
      { store },
      {
        ...validInput,
        adjustmentPoisha: 40000,
      },
    );

    expect(result.newTotalPoisha).toBe(340000);
    expect(result.status).toBe('Unpaid');
    expect(result.excessCreditPoisha).toBe(0);
  });

  it('settles the bill when the balance becomes zero', async () => {
    const { store, applyCorrection } = setup();

    const result = await correctUnpaidBill(
      { store },
      {
        ...validInput,
        adjustmentPoisha: -300000,
      },
    );

    expect(result.newTotalPoisha).toBe(0);
    expect(result.status).toBe('Paid');

    expect(applyCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        newTotalPoisha: 0,
        newStatus: 'Paid',
        excessCreditPoisha: 0,
      }),
    );
  });

  it('records excess credit when adjustment exceeds the balance', async () => {
    const { store, applyCorrection } = setup();

    const result = await correctUnpaidBill(
      { store },
      {
        ...validInput,
        adjustmentPoisha: -350000,
      },
    );

    expect(result.newTotalPoisha).toBe(-50000);
    expect(result.excessCreditPoisha).toBe(50000);
    expect(result.status).toBe('Paid');

    expect(applyCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        newTotalPoisha: -50000,
        excessCreditPoisha: 50000,
        newStatus: 'Paid',
      }),
    );
  });

  it('trims the correction reason', async () => {
    const { store, applyCorrection } = setup();

    await correctUnpaidBill(
      { store },
      {
        ...validInput,
        reason: '  Incorrect generator charge  ',
      },
    );

    expect(applyCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Incorrect generator charge',
      }),
    );
  });

  it('requires a correction reason', async () => {
    const { store, applyCorrection } = setup();

    await expect(
      correctUnpaidBill(
        { store },
        {
          ...validInput,
          reason: '   ',
        },
      ),
    ).rejects.toThrow('Write a reason');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it('requires the bill ID', async () => {
    const { store, findBillById } = setup();

    await expect(
      correctUnpaidBill(
        { store },
        {
          ...validInput,
          billId: '',
        },
      ),
    ).rejects.toThrow('Bill and manager are required');

    expect(findBillById).not.toHaveBeenCalled();
  });

  it('requires a manager ID', async () => {
    const { store, applyCorrection } = setup();

    await expect(
      correctUnpaidBill(
        { store },
        {
          ...validInput,
          managerId: '  ',
        },
      ),
    ).rejects.toThrow('Bill and manager are required');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it('rejects a zero adjustment', async () => {
    const { store, applyCorrection } = setup();

    await expect(
      correctUnpaidBill(
        { store },
        {
          ...validInput,
          adjustmentPoisha: 0,
        },
      ),
    ).rejects.toThrow('Adjustment amount cannot be zero');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648, -2147483649])(
    'rejects invalid adjustment %s',
    async (adjustmentPoisha) => {
      const { store, applyCorrection } = setup();

      await expect(
        correctUnpaidBill(
          { store },
          {
            ...validInput,
            adjustmentPoisha,
          },
        ),
      ).rejects.toThrow('Enter a valid adjustment amount');

      expect(applyCorrection).not.toHaveBeenCalled();
    },
  );

  it('throws when the bill is missing', async () => {
    const { store, findBillById, applyCorrection } = setup();

    findBillById.mockResolvedValue(undefined);

    await expect(correctUnpaidBill({ store }, validInput)).rejects.toThrow('Bill not found');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it.each(['Paid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'does not correct a bill in %s status',
    async (status) => {
      const { store, applyCorrection } = setup(makeBill({ status }));

      await expect(correctUnpaidBill({ store }, validInput)).rejects.toThrow(
        'Only Unpaid bills can be corrected',
      );

      expect(applyCorrection).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid existing bill totals', async () => {
    const { store, applyCorrection } = setup(makeBill({ totalPoisha: -100 }));

    await expect(correctUnpaidBill({ store }, validInput)).rejects.toThrow('Invalid bill total');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it('rejects a corrected total exceeding the database limit', async () => {
    const { store, applyCorrection } = setup(makeBill({ totalPoisha: 2147483640 }));

    await expect(
      correctUnpaidBill(
        { store },
        {
          ...validInput,
          adjustmentPoisha: 100,
        },
      ),
    ).rejects.toThrow('The corrected bill amount is too large');

    expect(applyCorrection).not.toHaveBeenCalled();
  });

  it('propagates an adapter transaction failure', async () => {
    const { store, applyCorrection } = setup();

    applyCorrection.mockRejectedValueOnce(new Error('Transaction failed'));

    await expect(correctUnpaidBill({ store }, validInput)).rejects.toThrow('Transaction failed');
  });
});
