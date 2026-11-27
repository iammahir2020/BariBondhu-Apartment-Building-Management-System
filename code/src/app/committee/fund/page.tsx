'use client';

/**
 * Fund summary page for committee members (`/committee/fund`, R-Fund, CM-04): shows the newest published month,
 * totals only. The screen is shared with residents and lives in `FundSummaryView`.
 *
 * @author Ayesha Siddiqa
 */
import { FundSummaryView } from '@/components/fund/FundSummaryView';

/**
 * The Fund summary page for the committee.
 * @returns The fund summary screen.
 */
export default function CommitteeFundPage() {
  return <FundSummaryView />;
}
