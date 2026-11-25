/**
 * @jest-environment jsdom
 */
/**
 * Tests for the manager's overpayments page: the list, Mark refunded with its confirm step, a refusal, and the empty
 * list (BM-04, BR-04).
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetchByRoute } from '@/components/auth/testFetch';
import {
  ManagerOverpayments,
  overpaymentStatusLine,
  type OverpaymentJson,
} from './ManagerOverpayments';

const toastSuccess = jest.fn();
jest.mock('sonner', () => ({ toast: { success: (message: string) => toastSuccess(message) } }));

const FLAGGED: OverpaymentJson = {
  id: '7d3f0b9a-1c2e-4f5a-8b6c-9d0e1f2a3b4c',
  status: 'Flagged',
  amountPoisha: 485000,
  flaggedAt: '2026-11-20T12:42:00Z',
  refundedAt: null,
  refundedByName: null,
  billingMonth: '2026-11-01',
  flatLabel: 'A, Flat 9A',
  gatewayTransactionId: 'SIM-42',
};

const REFUNDED: OverpaymentJson = {
  ...FLAGGED,
  id: 'refunded-1',
  status: 'Refunded',
  refundedAt: '2026-11-21T04:00:00Z',
  refundedByName: 'Nasrin Sultana',
};

beforeEach(() => {
  toastSuccess.mockClear();
});

describe('ManagerOverpayments', () => {
  it('lists overpayments with what is left to refund (normal)', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/overpayments',
        status: 200,
        body: { overpayments: [FLAGGED, REFUNDED] },
      },
    ]);
    render(<ManagerOverpayments />);

    expect(await screen.findByText('1 to refund · ৳4,850.00')).toBeInTheDocument();
    expect(screen.getAllByText('To refund').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Mark refunded' }).length).toBeGreaterThan(0);
  });

  it('asks first, then marks it refunded and says so (normal)', async () => {
    const fetch = answerFetchByRoute([
      { method: 'GET', url: '/api/overpayments', status: 200, body: { overpayments: [FLAGGED] } },
      { method: 'POST', url: '/api/overpayments/*', status: 204, body: null },
    ]);
    const user = userEvent.setup();
    render(<ManagerOverpayments />);

    const [button] = await screen.findAllByRole('button', { name: 'Mark refunded' });
    await user.click(button!);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Only do this after you have returned ৳4,850.00 to A, Flat 9A',
    );
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/refund'), expect.anything());

    await user.click(within(dialog).getByRole('button', { name: 'Mark refunded' }));
    expect(fetch).toHaveBeenCalledWith(
      `/api/overpayments/${FLAGGED.id}/refund`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Marked refunded: ৳4,850.00 to A, Flat 9A');
  });

  it('changes nothing when the manager cancels (boundary)', async () => {
    const fetch = answerFetchByRoute([
      { method: 'GET', url: '/api/overpayments', status: 200, body: { overpayments: [FLAGGED] } },
    ]);
    const user = userEvent.setup();
    render(<ManagerOverpayments />);

    const [button] = await screen.findAllByRole('button', { name: 'Mark refunded' });
    await user.click(button!);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the refusal when it was already refunded (exception)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/overpayments', status: 200, body: { overpayments: [FLAGGED] } },
      {
        method: 'POST',
        url: '/api/overpayments/*',
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'This overpayment is already marked Refunded.' },
        },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerOverpayments />);

    const [button] = await screen.findAllByRole('button', { name: 'Mark refunded' });
    await user.click(button!);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark refunded' }),
    );
    expect(
      await screen.findByText('This overpayment is already marked Refunded.'),
    ).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('says so when nobody has paid twice (boundary)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/overpayments', status: 200, body: { overpayments: [] } },
    ]);
    render(<ManagerOverpayments />);
    expect(await screen.findByText('No overpayments. Nobody has paid twice.')).toBeInTheDocument();
  });
});

describe('overpaymentStatusLine', () => {
  it('says when it was flagged, or when and by whom it was refunded', () => {
    expect(overpaymentStatusLine(FLAGGED)).toMatch(/^Flagged 20 Nov 2026/);
    expect(overpaymentStatusLine(REFUNDED)).toMatch(/^Refunded 21 Nov 2026, .* by Nasrin Sultana$/);
  });
});
