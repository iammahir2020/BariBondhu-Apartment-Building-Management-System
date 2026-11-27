'use client';

/**
 * Fund summary page for residents (`/resident/fund`, R-Fund, RES-05): shows the newest published month, totals
 * only. The screen is shared with the committee and lives in `FundSummaryView`.
 *
 * @author Ayesha Siddiqa
 */
import { FundSummaryView } from '@/components/fund/FundSummaryView';

/**
 * The Fund summary page for residents.
 * @returns The fund summary screen.
 */
export default function ResidentFundPage() {
  return <FundSummaryView />;
}
