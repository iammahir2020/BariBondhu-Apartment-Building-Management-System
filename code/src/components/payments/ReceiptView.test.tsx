/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Receipt page (RES-01, UC-R08): what it shows, printing, and a bill that has no receipt.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetch } from '@/components/auth/testFetch';
import { ReceiptView } from './ReceiptView';

const RECEIPT = {
  receiptNumber: 'R-2611-0101',
  flatLabel: 'Block A, Flat 3B',
  billingMonth: '2026-11-01',
  lines: [
    { type: 'service', amountPoisha: 350_000, description: null },
    { type: 'generator', amountPoisha: 80_000, description: null },
    { type: 'water', amountPoisha: 55_000, description: null },
  ],
  totalPoisha: 485_000,
  paidAt: '2026-11-25T04:02:00.000Z',
  method: 'Online',
  gatewayTransactionId: 'SIM-1A2B3C4D5E6F',
};

describe('ReceiptView', () => {
  it('shows the receipt number, the transaction id, the amount and the date paid (TC-R01-18)', async () => {
    const fetch = answerFetch(200, RECEIPT);

    render(<ReceiptView billId="bill-1" />);

    expect(await screen.findByText('R-2611-0101')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/bills/bill-1/receipt', expect.anything());
    expect(screen.getByText('SIM-1A2B3C4D5E6F')).toBeInTheDocument();
    expect(screen.getByText('25 Nov 2026, 10:02 am')).toBeInTheDocument();
    expect(screen.getByText('November 2026 bill · Block A, Flat 3B')).toBeInTheDocument();
    expect(screen.getAllByText('৳4,850.00')).toHaveLength(2);
    expect(screen.getByText('Service charge')).toBeInTheDocument();
    expect(screen.getByText('Online (test gateway)')).toBeInTheDocument();
  });

  it('opens the print dialog to download or print it', async () => {
    answerFetch(200, RECEIPT);
    const print = jest.fn();
    window.print = print;
    render(<ReceiptView billId="bill-1" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Download or print' }));

    expect(print).toHaveBeenCalled();
  });

  it('shows why there is no receipt, with the way back to Dues (TC-R01-19)', async () => {
    answerFetch(409, {
      error: { code: 'CONFLICT', message: "This bill isn't paid yet, so it has no receipt." },
    });

    render(<ReceiptView billId="bill-1" />);

    expect(
      await screen.findByText("This bill isn't paid yet, so it has no receipt."),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Dues' })).toHaveAttribute(
      'href',
      '/resident/dues',
    );
    expect(screen.queryByRole('button', { name: 'Download or print' })).not.toBeInTheDocument();
  });
});
