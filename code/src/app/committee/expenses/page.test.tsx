/**
 * @jest-environment jsdom
 */
/**
 * Tests for the committee's Approve expenses page: it says "Loading…" until the list arrives, and only then says
 * that nothing is waiting, so a slow load never looks like an empty list.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import CommitteeExpensesPage from '@/app/committee/expenses/page';
import { answerFetch } from '@/components/auth/testFetch';

describe('CommitteeExpensesPage', () => {
  it('shows a loading placeholder before the expenses arrive, not "No expenses are waiting"', () => {
    global.fetch = jest.fn(() => new Promise<never>(() => undefined)) as unknown as typeof fetch;
    render(<CommitteeExpensesPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading expenses…');
    expect(screen.queryByText('No expenses are waiting.')).not.toBeInTheDocument();
    expect(screen.queryByText('No expenses decided yet.')).not.toBeInTheDocument();
  });

  it('says nothing is waiting once an empty list arrives (boundary)', async () => {
    answerFetch(200, { expenses: [] });
    render(<CommitteeExpensesPage />);
    expect(await screen.findByText('No expenses are waiting.')).toBeInTheDocument();
    expect(screen.getByText('No expenses decided yet.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stops loading and shows the error when the list fails (exception)', async () => {
    answerFetch(500, { error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } });
    render(<CommitteeExpensesPage />);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
