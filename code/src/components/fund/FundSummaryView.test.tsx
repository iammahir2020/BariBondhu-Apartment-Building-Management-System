/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Fund summary screen shared by residents and the committee: the newest published month with totals
 * only, the "Not ready yet" note, the Revised badge, a load failure, and the two pages that use it (RES-05, NFR-12).
 *
 * @author Ayesha Siddiqa
 */
import { render, screen } from '@testing-library/react';
import { answerFetchByRoute } from '@/components/auth/testFetch';
import CommitteeFundPage from '@/app/committee/fund/page';
import ResidentFundPage from '@/app/resident/fund/page';
import { FundSummaryView } from './FundSummaryView';

const OCTOBER = {
  id: 's-1',
  month: '2026-10-01',
  openingBalancePoisha: 31240000,
  totalCollectedPoisha: 42685000,
  spentRepairPoisha: 4820000,
  spentSalaryPoisha: 19500000,
  spentUtilityPoisha: 11230000,
  spentOtherPoisha: 960000,
  closingBalancePoisha: 37415000,
  totalOutstandingPoisha: 5820000,
  status: 'Published',
  publishedAt: '2026-11-03T04:00:00Z',
};

function answerWith(summaries: unknown[]): void {
  answerFetchByRoute([
    { method: 'GET', url: '/api/fund-summary', status: 200, body: { summaries } },
  ]);
}

describe('FundSummaryView', () => {
  it('shows the newest published month with every figure (normal)', async () => {
    answerWith([OCTOBER, { ...OCTOBER, id: 's-0', month: '2026-09-01' }]);
    render(<FundSummaryView />);

    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
    expect(screen.getByText('Published 3 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('৳312,400.00')).toBeInTheDocument();
    expect(screen.getByText('+ ৳426,850.00')).toBeInTheDocument();
    expect(screen.getByText('\u2212 ৳365,100.00')).toBeInTheDocument();
    expect(screen.getByText('৳374,150.00')).toBeInTheDocument();
    expect(screen.getByText('৳195,000.00')).toBeInTheDocument();
    expect(screen.getByText('৳112,300.00')).toBeInTheDocument();
    expect(screen.getByText('৳48,200.00')).toBeInTheDocument();
    expect(screen.getByText('৳9,600.00')).toBeInTheDocument();
    expect(screen.getByText('৳58,200.00')).toBeInTheDocument();
    expect(screen.getByText('Total only. No flat is named.')).toBeInTheDocument();
  });

  it('shows the Revised badge for a revised month', async () => {
    answerWith([{ ...OCTOBER, status: 'Revised' }]);
    render(<FundSummaryView />);
    expect(await screen.findByText('Revised')).toBeInTheDocument();
  });

  it('handles a month with nothing spent (boundary)', async () => {
    answerWith([
      {
        ...OCTOBER,
        spentRepairPoisha: 0,
        spentSalaryPoisha: 0,
        spentUtilityPoisha: 0,
        spentOtherPoisha: 0,
      },
    ]);
    render(<FundSummaryView />);
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(screen.getByText('\u2212 ৳0.00')).toBeInTheDocument();
  });

  it('says "Not ready yet" when no month is published (boundary, RES-05 c3)', async () => {
    answerWith([]);
    render(<FundSummaryView />);
    expect(await screen.findByText('Not ready yet')).toBeInTheDocument();
  });

  it('shows the error message when loading fails (exception)', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/fund-summary',
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: "You don't have access to this." } },
      },
    ]);
    render(<FundSummaryView />);
    expect(await screen.findByText("You don't have access to this.")).toBeInTheDocument();
  });
});

describe('the Fund summary pages', () => {
  it('the resident page shows the screen', async () => {
    answerWith([]);
    render(<ResidentFundPage />);
    expect(await screen.findByText('Not ready yet')).toBeInTheDocument();
  });

  it('the committee page shows the screen', async () => {
    answerWith([OCTOBER]);
    render(<CommitteeFundPage />);
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
  });
});
