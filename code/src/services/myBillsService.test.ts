/**
 * Tests for what a household sees of its bills (RES-01): Dues and the receipt.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  MY_BILL_ERRORS,
  formatReceiptNumber,
  getReceipt,
  listMyBills,
  type MyBillRow,
  type MyBillStore,
  type ReceiptRow,
} from '@/services/myBillsService';
import { makeProfile } from '@/services/testFakes';

const RESIDENT = makeProfile({ id: 'resident-1', role: 'resident', occupancyId: 'occ-1' });
const MANAGER = makeProfile({ id: 'manager-1', role: 'manager' });
const PAID_AT = new Date('2026-11-25T10:02:00+06:00');

const LINES = [
  { type: 'service' as const, amountPoisha: 250_000, description: null },
  { type: 'generator' as const, amountPoisha: 60_000, description: null },
  { type: 'water' as const, amountPoisha: 40_000, description: null },
];

function row(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: 'bill-1',
    occupancyId: 'occ-1',
    billingMonth: '2026-11-01',
    dueDate: '2026-11-10',
    totalPoisha: 350_000,
    status: 'Unpaid',
    lines: LINES,
    latestPayment: null,
    receipt: null,
    overpayments: [],
    flatLabel: 'Block A, Flat 3B',
    paidBy: null,
    ...overrides,
  };
}

function storeOf(rows: ReceiptRow[]): MyBillStore & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async listForOccupancy(occupancyId) {
      asked.push(occupancyId);
      return rows.filter((r) => r.occupancyId === occupancyId).map((r): MyBillRow => ({ ...r }));
    },
    async findForReceipt(billId) {
      return rows.find((r) => r.id === billId) ?? null;
    },
  };
}

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('formatReceiptNumber', () => {
  it.each([
    [1, '2026-11-01', 'R-2611-0001'],
    [101, '2026-11-01', 'R-2611-0101'],
    [142, '2026-10-01', 'R-2610-0142'],
    [9_999, '2027-01-01', 'R-2701-9999'],
    [12_345, '2026-12-01', 'R-2612-12345'],
  ])('prints receipt %i of a %s bill as %s', (number, month, printed) => {
    expect(formatReceiptNumber(number, month)).toBe(printed);
  });
});

describe('listMyBills', () => {
  it('shows each bill with its lines, total and due date, newest month first (TC-R01-01)', async () => {
    const store = storeOf([
      row({
        id: 'bill-oct',
        billingMonth: '2026-10-01',
        dueDate: '2026-10-10',
        status: 'Carried forward',
      }),
      row({ id: 'bill-nov' }),
    ]);

    const bills = await listMyBills(store, RESIDENT);

    expect(store.asked).toEqual(['occ-1']);
    expect(bills.map((b) => b.id)).toEqual(['bill-nov', 'bill-oct']);
    expect(bills[0]).toEqual({
      id: 'bill-nov',
      billingMonth: '2026-11-01',
      dueDate: '2026-11-10',
      totalPoisha: 350_000,
      status: 'Unpaid',
      lines: LINES,
      canPay: true,
      paymentProblem: null,
      receiptNumber: null,
      overpayments: [],
    });
  });

  it.each(['Payment pending', 'Awaiting verification', 'Paid', 'Carried forward'] as const)(
    'offers no payment for a %s bill (BR-03, TC-R01-03)',
    async (status) => {
      const bills = await listMyBills(storeOf([row({ status })]), RESIDENT);

      expect(bills[0]?.canPay).toBe(false);
    },
  );

  it('shows why the last payment ended while the bill is Unpaid again (TC-R01-17)', async () => {
    const store = storeOf([
      row({
        latestPayment: {
          gatewayTransactionId: 'SIM-1',
          endedAt: new Date('2026-11-25T09:30:00+06:00'),
          endReason: 'The payment was declined.',
        },
      }),
    ]);

    const [bill] = await listMyBills(store, RESIDENT);

    expect(bill?.paymentProblem).toBe('The payment was declined.');
    expect(bill?.canPay).toBe(true);
  });

  it('shows no problem while a payment is still open, or once the bill is Paid', async () => {
    const open = { gatewayTransactionId: 'SIM-2', endedAt: null, endReason: null };
    const store = storeOf([
      row({ id: 'pending', status: 'Payment pending', latestPayment: open }),
      row({
        id: 'paid',
        billingMonth: '2026-10-01',
        status: 'Paid',
        latestPayment: {
          gatewayTransactionId: 'SIM-1',
          endedAt: new Date('2026-10-05T09:00:00+06:00'),
          endReason: 'The payment was declined.',
        },
        receipt: { number: 7, paidAt: PAID_AT },
      }),
    ]);

    const bills = await listMyBills(store, RESIDENT);

    expect(bills.map((b) => b.paymentProblem)).toEqual([null, null]);
    expect(bills[1]?.receiptNumber).toBe('R-2610-0007');
  });

  it("does not show an earlier household's bills for the same flat (TC-R01-22)", async () => {
    const store = storeOf([row({ id: 'old', occupancyId: 'occ-0' }), row({ id: 'mine' })]);

    const bills = await listMyBills(store, RESIDENT);

    expect(bills.map((b) => b.id)).toEqual(['mine']);
  });

  it('returns an empty list when the household has no bills yet', async () => {
    expect(await listMyBills(storeOf([]), RESIDENT)).toEqual([]);
  });

  it('refuses an account with no household', async () => {
    const error = await refusal(listMyBills(storeOf([]), MANAGER));

    expect(error.status).toBe(403);
    expect(error.message).toBe(MY_BILL_ERRORS.household);
  });
});

describe('getReceipt', () => {
  const PAID = row({
    status: 'Paid',
    receipt: { number: 101, paidAt: PAID_AT },
    paidBy: { gatewayTransactionId: 'SIM-1A2B3C4D5E6F', amountPoisha: 350_000 },
  });

  it('gives the receipt number, the gateway transaction id, the amount and the date paid (TC-R01-18)', async () => {
    const receipt = await getReceipt(storeOf([PAID]), { actor: RESIDENT, scope: 'own' }, 'bill-1');

    expect(receipt).toEqual({
      receiptNumber: 'R-2611-0101',
      flatLabel: 'Block A, Flat 3B',
      billingMonth: '2026-11-01',
      lines: LINES,
      totalPoisha: 350_000,
      paidAt: PAID_AT,
      method: 'Online',
      gatewayTransactionId: 'SIM-1A2B3C4D5E6F',
    });
  });

  it("lets the manager see any household's receipt", async () => {
    const other = { ...PAID, occupancyId: 'occ-2' };

    const receipt = await getReceipt(storeOf([other]), { actor: MANAGER, scope: 'all' }, 'bill-1');

    expect(receipt.receiptNumber).toBe('R-2611-0101');
  });

  it.each(['Unpaid', 'Payment pending', 'Awaiting verification', 'Carried forward'] as const)(
    'refuses a receipt for a %s bill (TC-R01-19)',
    async (status) => {
      const error = await refusal(
        getReceipt(storeOf([row({ status })]), { actor: RESIDENT, scope: 'own' }, 'bill-1'),
      );

      expect(error.status).toBe(409);
      expect(error.message).toBe(MY_BILL_ERRORS.notPaid);
      expect(error.details).toEqual({ status });
    },
  );

  it('refuses a Paid bill that has no receipt, as a bill made Paid with no payment (BR-07)', async () => {
    const zero = row({ status: 'Paid', totalPoisha: 0 });

    const error = await refusal(
      getReceipt(storeOf([zero]), { actor: RESIDENT, scope: 'own' }, 'bill-1'),
    );

    expect(error.status).toBe(409);
  });

  it("refuses another household's receipt (TC-R01-20)", async () => {
    const other = { ...PAID, occupancyId: 'occ-2' };

    const error = await refusal(
      getReceipt(storeOf([other]), { actor: RESIDENT, scope: 'own' }, 'bill-1'),
    );

    expect(error.status).toBe(403);
    expect(error.message).toBe(MY_BILL_ERRORS.notYours);
  });

  it("refuses a vacant flat's bill to a resident", async () => {
    const vacant = { ...PAID, occupancyId: null };

    const error = await refusal(
      getReceipt(storeOf([vacant]), { actor: RESIDENT, scope: 'own' }, 'bill-1'),
    );

    expect(error.status).toBe(403);
  });

  it('refuses a bill that does not exist', async () => {
    const error = await refusal(
      getReceipt(storeOf([]), { actor: RESIDENT, scope: 'own' }, 'bill-9'),
    );

    expect(error.status).toBe(404);
    expect(error.message).toBe(MY_BILL_ERRORS.notFound);
  });
});
