/**
 * @jest-environment jsdom
 */
/**
 * Tests for the manager's home: the needs and totals from the API, the empty state, the error, and links only to
 * pages that exist.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import { answerFetch, answerFetchByRoute } from '@/components/auth/testFetch';
import type { ManagerHomeSummary } from '@/services/managerHomeService';
import { ManagerHome } from './ManagerHome';

const BUSY: ManagerHomeSummary = {
  bills: { month: '2026-11-01', billed: 12, paid: 7, billedPoisha: 5820000, paidPoisha: 3395000 },
  tickets: { open: 5, lateUnassigned: 2, overdue: 1, urgent: 1 },
  waitingExpenses: { count: 2, totalPoisha: 3990000 },
  flaggedOverpayments: { count: 1, totalPoisha: 485000 },
};

describe('ManagerHome', () => {
  it('shows what needs the manager and the totals (normal)', async () => {
    const fetch = answerFetch(200, BUSY);
    render(<ManagerHome />);

    expect(await screen.findByText('2 late tickets, nobody assigned')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/dashboards/manager', expect.anything());
    expect(screen.getByText('1 overdue ticket')).toBeInTheDocument();
    expect(screen.getByText('1 overpayment to refund')).toBeInTheDocument();
    expect(screen.getByText('Paid for November')).toBeInTheDocument();
    expect(screen.getByText('৳33,950.00')).toBeInTheDocument();
    expect(screen.getByText('7 of 12 bills paid · ৳58,200.00 billed')).toBeInTheDocument();
    expect(screen.getByText('Open tickets').parentElement).toHaveTextContent('5');
  });

  it('links every card to its page, including the ticket alerts and Open tickets', async () => {
    answerFetch(200, BUSY);
    render(<ManagerHome />);
    await screen.findByText('Open tickets');

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/manager/tickets',
      '/manager/tickets',
      '/manager/overpayments',
      '/manager/bills',
      '/manager/tickets',
      '/manager/expenses',
      '/manager/fund',
    ]);
    expect(links[2]).toHaveTextContent('1 overpayment to refund');
    expect(links[3]).toHaveTextContent('Paid for November');
    expect(links[4]).toHaveTextContent('Open tickets');
    expect(links[5]).toHaveTextContent('Expenses waiting for committee');
  });

  it('shows the latest published closing balance on the Fund card (normal, BM-12)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/dashboards/manager', status: 200, body: BUSY },
      {
        method: 'GET',
        url: '/api/fund-summary',
        status: 200,
        body: { summaries: [{ month: '2026-10-01', closingBalancePoisha: 37415000 }] },
      },
    ]);
    render(<ManagerHome />);
    expect(await screen.findByText('৳374,150.00')).toBeInTheDocument();
    expect(screen.getByText('Closing balance, 2026-10')).toBeInTheDocument();
  });

  it('says the fund summary is not ready when no month is published (boundary)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/dashboards/manager', status: 200, body: BUSY },
      { method: 'GET', url: '/api/fund-summary', status: 200, body: { summaries: [] } },
    ]);
    render(<ManagerHome />);
    expect(await screen.findByText('Not ready yet')).toBeInTheDocument();
  });
  it('says nothing needs the manager when all is quiet (boundary)', async () => {
    answerFetch(200, {
      ...BUSY,
      tickets: { open: 0, lateUnassigned: 0, overdue: 0, urgent: 0 },
      flaggedOverpayments: { count: 0, totalPoisha: 0 },
    });
    render(<ManagerHome />);
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(screen.getByText('None overdue')).toBeInTheDocument();
  });

  it('shows the error when the counts fail to load (exception)', async () => {
    answerFetch(500, {
      error: { code: 'INTERNAL', message: 'Something went wrong. Try again in a minute.' },
    });
    render(<ManagerHome />);
    expect(
      await screen.findByText('Something went wrong. Try again in a minute.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Needs you now')).not.toBeInTheDocument();
  });
});
