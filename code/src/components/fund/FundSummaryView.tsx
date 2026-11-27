'use client';

/**
 * The Fund summary screen for residents and committee members (R-Fund, RES-05, CM-04): the newest published month
 * with its opening balance, collected, spent, closing balance, where the money went and the total still owed. Only
 * totals are shown, never which flats owe money (NFR-12). When no month is published yet it says so. Every figure
 * comes from `/api/fund-summary`.
 *
 * @author Ayesha Siddiqa
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';

type SummaryStatus = 'Draft' | 'Published' | 'Revised';

interface SummaryRow {
  id: string;
  month: string;
  openingBalancePoisha: number;
  totalCollectedPoisha: number;
  spentRepairPoisha: number;
  spentSalaryPoisha: number;
  spentUtilityPoisha: number;
  spentOtherPoisha: number;
  closingBalancePoisha: number;
  totalOutstandingPoisha: number;
  status: SummaryStatus;
  publishedAt: string | null;
}

interface SummariesResponse {
  summaries: SummaryRow[];
}

/** Money for reading, like ৳3,12,400.00; a minus sign comes first for a negative amount. */
function formatMoney(poisha: number): string {
  const sign = poisha < 0 ? '\u2212' : '';
  const taka = Math.abs(poisha) / 100;
  return `${sign}\u09F3${taka.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A first-of-month date like 2026-10-01 for reading, like "October 2026". */
function monthLabel(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** A timestamp for reading, like 3 Nov 2026. */
function formatDate(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
}

/** The share of the spent total a category took, as a whole percent for a bar. */
function share(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * The Fund summary for residents and the committee.
 * @returns The newest published month, or a "not ready yet" note.
 */
export function FundSummaryView() {
  const [summaries, setSummaries] = useState<SummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await callApi<SummariesResponse>('/api/fund-summary', 'GET');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSummaries(result.data.summaries);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = summaries !== null && summaries.length > 0 ? summaries[0] : undefined;
  const categories =
    latest === undefined
      ? []
      : [
          { label: 'Salaries', poisha: latest.spentSalaryPoisha },
          { label: 'Utilities', poisha: latest.spentUtilityPoisha },
          { label: 'Repairs', poisha: latest.spentRepairPoisha },
          { label: 'Other', poisha: latest.spentOtherPoisha },
        ];
  const totalSpent = categories.reduce((sum, row) => sum + row.poisha, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Fund summary</h1>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {summaries !== null && latest === undefined && (
        <Card>
          <CardContent>
            <div className="font-semibold">Not ready yet</div>
            <p className="text-sm text-muted-foreground">
              The manager publishes the fund summary after a month ends. No month has been published
              yet.
            </p>
          </CardContent>
        </Card>
      )}

      {latest !== undefined && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{monthLabel(latest.month)}</div>
              {latest.publishedAt !== null && (
                <div className="text-sm text-muted-foreground">
                  Published {formatDate(latest.publishedAt)}
                </div>
              )}
            </div>
            <Badge variant={latest.status === 'Revised' ? 'info' : 'ok'}>{latest.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            The next month is published after it ends.
          </p>

          <Card>
            <CardContent className="flex flex-col gap-2">
              <div className="flex justify-between gap-3">
                <span>Opening balance</span>
                <span>{formatMoney(latest.openingBalancePoisha)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Collected</span>
                <span className="text-ok">+ {formatMoney(latest.totalCollectedPoisha)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Spent</span>
                <span className="text-bad">{`${String.fromCharCode(0x2212)} ${formatMoney(totalSpent)}`}</span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-2 font-bold">
                <span>Closing balance</span>
                <span>{formatMoney(latest.closingBalancePoisha)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="font-semibold">Where the money went</div>
              {categories.map((row) => (
                <div key={row.label} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <span>{row.label}</span>
                    <span className="font-semibold">{formatMoney(row.poisha)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-2.5 rounded-full bg-primary"
                      style={{ width: `${share(row.poisha, totalSpent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Still owed by flats</div>
                <div className="text-sm text-muted-foreground">Total only. No flat is named.</div>
              </div>
              <span className="text-lg font-semibold">
                {formatMoney(latest.totalOutstandingPoisha)}
              </span>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            Only expenses the committee approved are counted.
          </p>
        </>
      )}
    </div>
  );
}
