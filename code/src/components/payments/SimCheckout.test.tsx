/**
 * @jest-environment jsdom
 */
/**
 * Tests for the simulated gateway's test checkout (RES-01, BB-0608): what it shows for a pending or finished payment,
 * each button, the held-back confirmation, and the app refusing a confirmation.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GatewayPaymentStatus } from '@/services/paymentGateway';
import { DUES_PATH, SimCheckout } from './SimCheckout';

const PENDING: GatewayPaymentStatus = {
  transactionId: 'SIM-1A2B3C4D5E6F',
  reference: 'payment-1',
  amountPoisha: 485_000,
  state: 'Pending',
  reason: null,
};
const PAID: GatewayPaymentStatus = { ...PENDING, state: 'Succeeded' };
const API = '/api/sim-gateway/transactions/SIM-1A2B3C4D5E6F';

/** Answers fetch calls in order with the given statuses and bodies. */
function answers(...replies: [number, unknown][]): jest.Mock {
  const queue = [...replies];
  const mock = jest.fn(async () => {
    const [status, body] = queue.shift() ?? [500, {}];
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function result(
  status: GatewayPaymentStatus,
  delivered: boolean,
  deliveryError: string | null = null,
) {
  return { status, delivered, deliveryError };
}

describe('SimCheckout', () => {
  it('shows the amount, the transaction and the four buttons for a pending payment', async () => {
    answers([200, PENDING]);

    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    expect(await screen.findByRole('button', { name: 'Pay ৳4,850.00' })).toBeInTheDocument();
    expect(screen.getByText('SIM-1A2B3C4D5E6F')).toBeInTheDocument();
    expect(screen.getByText('No real money')).toBeInTheDocument();
    for (const name of ['Pay but confirm late', 'Fail the payment', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Back to BariBondhu' })).not.toBeInTheDocument();
  });

  it('pays, says BariBondhu has the confirmation, and offers the way back to Dues', async () => {
    const fetch = answers([200, PENDING], [200, result(PAID, true)]);
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pay ৳4,850.00' }));

    expect(fetch).toHaveBeenLastCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ choice: 'pay' }) }),
    );
    expect(await screen.findByText('Paid. BariBondhu has the confirmation.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to BariBondhu' })).toHaveAttribute(
      'href',
      DUES_PATH,
    );
    expect(
      screen.queryByRole('button', { name: 'Send the confirmation now' }),
    ).not.toBeInTheDocument();
  });

  it('holds the confirmation back, then sends it when asked', async () => {
    const fetch = answers([200, PENDING], [200, result(PAID, false)], [200, result(PAID, true)]);
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Pay but confirm late' }));
    expect(await screen.findByText(/confirmation is held back/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send the confirmation now' }));

    expect(fetch).toHaveBeenLastCalledWith(
      `${API}/confirmation`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Paid. BariBondhu has the confirmation.')).toBeInTheDocument();
  });

  it.each([
    ['Fail the payment', 'fail', 'Failed', 'The payment was declined.'],
    ['Cancel', 'cancel', 'Cancelled', 'You cancelled the payment.'],
  ] as const)('%s ends the payment and shows the reason', async (name, choice, state, reason) => {
    const fetch = answers([200, PENDING], [200, result({ ...PENDING, state, reason }, true)]);
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    await userEvent.setup().click(await screen.findByRole('button', { name }));

    expect(fetch).toHaveBeenLastCalledWith(
      API,
      expect.objectContaining({ body: JSON.stringify({ choice }) }),
    );
    expect(await screen.findByText(reason)).toBeInTheDocument();
  });

  it('says when BariBondhu refused the confirmation', async () => {
    answers(
      [200, PENDING],
      [200, result(PAID, false, 'This bill changed while you were paying. Open Dues again.')],
    );
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pay ৳4,850.00' }));

    expect(
      await screen.findByText(/did not accept the confirmation: This bill changed/),
    ).toBeInTheDocument();
  });

  it('shows a finished payment without the buttons, with a way to resend a paid one', async () => {
    answers([200, PAID]);

    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    expect(await screen.findByText('This payment is already paid.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay ৳4,850.00' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send the confirmation now' })).toBeInTheDocument();
  });

  it('shows a cancelled payment as cancelled', async () => {
    answers([200, { ...PENDING, state: 'Cancelled', reason: 'You cancelled the payment.' }]);

    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    expect(await screen.findByText('This payment is already cancelled.')).toBeInTheDocument();
  });

  it('shows the error when the payment cannot be loaded', async () => {
    answers([404, { error: { code: 'NOT_FOUND', message: 'The gateway has no such payment.' } }]);

    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    expect(await screen.findByText('The gateway has no such payment.')).toBeInTheDocument();
  });

  it('shows the error when a button is refused', async () => {
    answers(
      [200, PENDING],
      [409, { error: { code: 'CONFLICT', message: 'This payment is already finished.' } }],
    );
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('This payment is already finished.')).toBeInTheDocument();
  });

  it('falls back to its own words for a failure with no reason', async () => {
    answers([200, PENDING], [200, result({ ...PENDING, state: 'Failed' }, true)]);
    render(<SimCheckout transactionId="SIM-1A2B3C4D5E6F" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Fail the payment' }));

    expect(await screen.findByText('The payment did not go through.')).toBeInTheDocument();
  });
});
