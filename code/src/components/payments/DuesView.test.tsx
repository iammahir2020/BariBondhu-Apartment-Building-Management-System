/**
 * @jest-environment jsdom
 */
/**
 * Tests for Dues (RES-01): the bill with its lines and total, Pay only while Unpaid, the messages for a pending or
 * failed payment, checking again while pending, and the earlier bills with their receipts.
 *
 * @author Mahir Al Kamal
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyBillView } from '@/services/myBillsService';
import { DuesView, PENDING_REFRESH_MS, receiptPath } from './DuesView';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const NOVEMBER: MyBillView = {
  id: 'bill-nov',
  billingMonth: '2026-11-01',
  dueDate: '2026-11-20',
  totalPoisha: 485_000,
  status: 'Unpaid',
  lines: [
    { type: 'service', amountPoisha: 350_000, description: null },
    { type: 'generator', amountPoisha: 80_000, description: null },
    { type: 'water', amountPoisha: 55_000, description: null },
  ],
  canPay: true,
  paymentProblem: null,
  receiptNumber: null,
};
const OCTOBER: MyBillView = {
  ...NOVEMBER,
  id: 'bill-oct',
  billingMonth: '2026-10-01',
  dueDate: '2026-10-20',
  status: 'Paid',
  canPay: false,
  receiptNumber: 'R-2610-0142',
};

/** Answers fetch calls in order; the last answer repeats. */
function answers(...replies: [number, unknown][]): jest.Mock {
  const queue = [...replies];
  const mock = jest.fn(async () => {
    const [status, body] = (queue.length > 1 ? queue.shift() : queue[0]) ?? [500, {}];
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

beforeEach(() => {
  push.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DuesView', () => {
  it('shows each charge, the total and the due date of the bill to pay (TC-R01-01)', async () => {
    answers([200, { bills: [NOVEMBER, OCTOBER] }]);

    render(<DuesView />);

    const card = await screen.findByRole('region', { name: 'November 2026 bill' });
    expect(within(card).getByText('Due 20 Nov 2026')).toBeInTheDocument();
    expect(within(card).getByText('Service charge')).toBeInTheDocument();
    expect(within(card).getByText('৳3,500.00')).toBeInTheDocument();
    expect(within(card).getByText('Generator')).toBeInTheDocument();
    expect(within(card).getByText('Water')).toBeInTheDocument();
    expect(within(card).getByText('৳4,850.00')).toBeInTheDocument();
    expect(within(card).getByText('Unpaid')).toBeInTheDocument();
  });

  it('starts a payment and goes to the checkout (TC-R01-03)', async () => {
    const fetch = answers(
      [200, { bills: [NOVEMBER] }],
      [
        201,
        {
          paymentId: 'payment-1',
          transactionId: 'SIM-1',
          checkoutUrl: '/sim-gateway/checkout/SIM-1',
        },
      ],
    );
    render(<DuesView />);

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Pay ৳4,850.00 online' }));

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/bills/bill-nov/payments',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(push).toHaveBeenCalledWith('/sim-gateway/checkout/SIM-1');
  });

  it('shows the refusal and reloads the bill when Pay is refused (TC-R01-04)', async () => {
    const fetch = answers(
      [200, { bills: [NOVEMBER] }],
      [
        409,
        { error: { code: 'CONFLICT', message: 'This bill already has a payment in progress' } },
      ],
      [200, { bills: [{ ...NOVEMBER, status: 'Payment pending', canPay: false }] }],
    );
    render(<DuesView />);

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Pay ৳4,850.00 online' }));

    expect(
      await screen.findByText('This bill already has a payment in progress'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await screen.findByRole('button', { name: 'Pay ৳4,850.00 online' })).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('disables Pay and explains the wait while a payment is pending (BR-03)', async () => {
    answers([200, { bills: [{ ...NOVEMBER, status: 'Payment pending', canPay: false }] }]);

    render(<DuesView />);

    expect(await screen.findByText('Waiting for the payment gateway')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ৳4,850.00 online' })).toBeDisabled();
  });

  it('checks again while pending and shows Paid once the gateway confirmed (TC-R01-06)', async () => {
    jest.useFakeTimers();
    const fetch = answers(
      [200, { bills: [{ ...NOVEMBER, status: 'Payment pending', canPay: false }] }],
      [
        200,
        { bills: [{ ...NOVEMBER, status: 'Paid', canPay: false, receiptNumber: 'R-2611-0101' }] },
      ],
    );
    render(<DuesView />);
    await screen.findByText('Waiting for the payment gateway');

    await act(async () => {
      jest.advanceTimersByTime(PENDING_REFRESH_MS);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText('Nothing to pay. All your bills are settled.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Paid · receipt R-2611-0101')).toBeInTheDocument();
  });

  it("shows why the last payment didn't go through, and lets me pay again (TC-R01-17)", async () => {
    answers([200, { bills: [{ ...NOVEMBER, paymentProblem: 'The payment was declined.' }] }]);

    render(<DuesView />);

    expect(await screen.findByText("Your last payment didn't go through")).toBeInTheDocument();
    expect(screen.getByText('The payment was declined.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ৳4,850.00 online' })).toBeEnabled();
  });

  it('explains a bill waiting for the manager to check a cash payment', async () => {
    answers([200, { bills: [{ ...NOVEMBER, status: 'Awaiting verification', canPay: false }] }]);

    render(<DuesView />);

    expect(
      await screen.findByText('The manager is checking your cash payment'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ৳4,850.00 online' })).toBeDisabled();
  });

  it('lists earlier bills, with a receipt link for a paid one', async () => {
    const carried: MyBillView = {
      ...NOVEMBER,
      id: 'bill-sep',
      billingMonth: '2026-09-01',
      status: 'Carried forward',
      canPay: false,
    };
    answers([200, { bills: [NOVEMBER, OCTOBER, carried] }]);

    render(<DuesView />);

    const list = await screen.findByRole('region', { name: 'Earlier bills' });
    expect(within(list).getByText('Paid · receipt R-2610-0142')).toBeInTheDocument();
    expect(within(list).getByText('Carried forward to a newer bill')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      receiptPath('bill-oct'),
    );
  });

  it('lets me pay an older Unpaid bill on its own (BR-05)', async () => {
    const older: MyBillView = {
      ...NOVEMBER,
      id: 'bill-oct',
      billingMonth: '2026-10-01',
      totalPoisha: 400_000,
    };
    const fetch = answers(
      [200, { bills: [NOVEMBER, older] }],
      [201, { checkoutUrl: '/sim-gateway/checkout/SIM-2' }],
    );
    render(<DuesView />);

    const list = await screen.findByRole('region', { name: 'Earlier bills' });
    expect(within(list).getByText('Due 20 Nov 2026')).toBeInTheDocument();
    await userEvent.setup().click(within(list).getByRole('button', { name: 'Pay ৳4,000.00' }));

    expect(fetch).toHaveBeenLastCalledWith('/api/bills/bill-oct/payments', expect.anything());
    expect(push).toHaveBeenCalledWith('/sim-gateway/checkout/SIM-2');
  });

  it('says so when everything is settled', async () => {
    answers([200, { bills: [OCTOBER] }]);

    render(<DuesView />);

    expect(
      await screen.findByText('Nothing to pay. All your bills are settled.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your bills' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /online/ })).not.toBeInTheDocument();
  });

  it('says so when there are no bills yet', async () => {
    answers([200, { bills: [] }]);

    render(<DuesView />);

    expect(await screen.findByText(/No bills yet/)).toBeInTheDocument();
  });

  it('shows the error when the bills cannot be loaded', async () => {
    answers([
      403,
      { error: { code: 'FORBIDDEN', message: 'Only a household account has bills to pay.' } },
    ]);

    render(<DuesView />);

    expect(
      await screen.findByText('Only a household account has bills to pay.'),
    ).toBeInTheDocument();
  });

  it('names an adjustment by its reason', async () => {
    answers([
      200,
      {
        bills: [
          {
            ...NOVEMBER,
            lines: [
              { type: 'adjustment', amountPoisha: -20_000, description: 'Water meter misread' },
            ],
          },
        ],
      },
    ]);

    render(<DuesView />);

    expect(await screen.findByText('Adjustment: Water meter misread')).toBeInTheDocument();
    expect(screen.getByText('−৳200.00')).toBeInTheDocument();
  });
});
