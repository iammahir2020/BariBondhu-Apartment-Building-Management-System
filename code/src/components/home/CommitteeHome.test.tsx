/**
 * @jest-environment jsdom
 */
/**
 * Tests for the committee member's home: waiting expenses and current rates from their routes, the empty states, and
 * one route failing without hiding the other.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import { answerFetchByRoute } from '@/components/auth/testFetch';
import { CommitteeHome } from './CommitteeHome';

const WAITING = {
  id: 'e-1',
  description: 'Water pump motor rewinding',
  category: 'repair',
  expenseDate: '2026-11-11',
  amountPoisha: 1850000,
  status: 'Waiting for approval',
};

const RATES = {
  current: [
    { chargeType: 'water', amountPoisha: 50000, meetingDate: '2026-11-01' },
    { chargeType: 'service', amountPoisha: 380000, meetingDate: '2026-11-01' },
  ],
  history: [],
};

function expenseList(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...WAITING,
    id: `e-${i}`,
    description: `Expense ${i}`,
    expenseDate: `2026-11-1${i}`,
  }));
}

describe('CommitteeHome', () => {
  it('lists the waiting expenses and the current rates (normal)', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/expenses',
        status: 200,
        body: { expenses: [WAITING, { ...WAITING, id: 'e-2', status: 'Approved' }] },
      },
      { method: 'GET', url: '/api/rates', status: 200, body: RATES },
    ]);
    render(<CommitteeHome />);

    expect(await screen.findByText('Water pump motor rewinding')).toBeInTheDocument();
    expect(screen.getByText('Repair · 11 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('৳18,500.00')).toBeInTheDocument();
    expect(await screen.findByText('Service charge')).toBeInTheDocument();
    expect(screen.getByText('৳3,800.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rates and history/ })).toHaveAttribute(
      'href',
      '/committee/rates',
    );
  });

  it('shows three and says how many wait in all (boundary)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/expenses', status: 200, body: { expenses: expenseList(5) } },
      { method: 'GET', url: '/api/rates', status: 200, body: RATES },
    ]);
    render(<CommitteeHome />);

    expect(await screen.findByRole('link', { name: /See all 5/ })).toHaveAttribute(
      'href',
      '/committee/expenses',
    );
    expect(screen.getAllByText(/^Expense \d$/)).toHaveLength(3);
  });

  it('says so when nothing waits and no rates are set (boundary)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/expenses', status: 200, body: { expenses: [] } },
      { method: 'GET', url: '/api/rates', status: 200, body: { current: [], history: [] } },
    ]);
    render(<CommitteeHome />);
    expect(await screen.findByText('Nothing is waiting for your decision.')).toBeInTheDocument();
    expect(await screen.findByText('No rates set yet.')).toBeInTheDocument();
  });

  it('shows the latest published closing balance, totals only (normal, CM-04)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/expenses', status: 200, body: { expenses: [] } },
      { method: 'GET', url: '/api/rates', status: 200, body: RATES },
      {
        method: 'GET',
        url: '/api/fund-summary',
        status: 200,
        body: {
          summaries: [
            {
              month: '2026-10-01',
              closingBalancePoisha: 37415000,
              totalOutstandingPoisha: 5820000,
            },
          ],
        },
      },
    ]);
    render(<CommitteeHome />);

    expect(await screen.findByText('Closing balance, 2026-10')).toBeInTheDocument();
    expect(screen.getByText('৳374,150.00')).toBeInTheDocument();
    expect(screen.getByText(/Still owed by flats: ৳58,200.00/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Fund summary/ })[0]).toHaveAttribute(
      'href',
      '/committee/fund',
    );
  });

  it('says not ready yet when no month is published (boundary)', async () => {
    answerFetchByRoute([
      { method: 'GET', url: '/api/expenses', status: 200, body: { expenses: [] } },
      { method: 'GET', url: '/api/rates', status: 200, body: RATES },
      { method: 'GET', url: '/api/fund-summary', status: 200, body: { summaries: [] } },
    ]);
    render(<CommitteeHome />);
    expect(await screen.findByText('Not ready yet. No month is published.')).toBeInTheDocument();
  });
  it('shows one failure and still shows the other card (exception)', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/expenses',
        status: 500,
        body: {
          error: { code: 'INTERNAL', message: 'Something went wrong. Try again in a minute.' },
        },
      },
      { method: 'GET', url: '/api/rates', status: 200, body: RATES },
    ]);
    render(<CommitteeHome />);
    expect(
      await screen.findByText('Something went wrong. Try again in a minute.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Service charge')).toBeInTheDocument();
  });
});
