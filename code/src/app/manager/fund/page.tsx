'use client';

/**
 * Fund summary page for the manager (`/manager/fund`, M-Fund, BM-12): enters the opening balance of the first
 * month and sends a corrected figure after a rejection, publishes a month that has ended, and lists the published
 * months. Taka are turned into poisha here because the API takes whole poisha; every rule is checked by the
 * services behind `/api/opening-balances` and `/api/fund-summary`.
 *
 * @author Ayesha Siddiqa
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';
import { LoadingRows } from '@/components/Loading';

type BalanceStatus = 'Waiting for approval' | 'Approved' | 'Rejected';

type SummaryStatus = 'Draft' | 'Published' | 'Revised';

interface BalanceRow {
  id: string;
  month: string;
  amountPoisha: number;
  note: string | null;
  status: BalanceStatus;
  decisionReason: string | null;
}

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
}

interface BalancesResponse {
  balances: BalanceRow[];
}

interface SummariesResponse {
  summaries: SummaryRow[];
}

const BALANCE_VARIANT: Readonly<Record<BalanceStatus, 'warn' | 'ok' | 'bad'>> = {
  'Waiting for approval': 'warn',
  Approved: 'ok',
  Rejected: 'bad',
};

const SUMMARY_VARIANT: Readonly<Record<SummaryStatus, 'warn' | 'ok' | 'info'>> = {
  Draft: 'warn',
  Published: 'ok',
  Revised: 'info',
};

/** Money for reading, like ৳3,12,400.00; a minus sign comes first for a negative amount. */
function formatMoney(poisha: number): string {
  const sign = poisha < 0 ? '\u2212' : '';
  const taka = Math.abs(poisha) / 100;
  return `${sign}\u09F3${taka.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole poisha to a plain taka number for an input, like 31240000 to "312400". */
function toTaka(poisha: number): string {
  return (poisha / 100).toString();
}

/** What the manager typed to whole poisha; null when blank or not a number. */
function toPoisha(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const taka = Number(trimmed);
  return Number.isFinite(taka) ? Math.round(taka * 100) : null;
}

/** A first-of-month date like 2026-10-01 for reading, like "October 2026". */
function monthLabel(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** A month input value like 2026-10 to the first day, 2026-10-01; '' when blank. */
function toFirstDay(value: string): string {
  return value === '' ? '' : `${value}-01`;
}

/**
 * The Fund summary page for the manager.
 * @returns The opening balance form, the publish form and the published months.
 */
export default function ManagerFundPage() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [balanceMonth, setBalanceMonth] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceNote, setBalanceNote] = useState('');
  const [publishMonth, setPublishMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [balanceResult, summaryResult] = await Promise.all([
      callApi<BalancesResponse>('/api/opening-balances', 'GET'),
      callApi<SummariesResponse>('/api/fund-summary', 'GET'),
    ]);
    setLoaded(true);
    if (!balanceResult.ok) {
      setError(balanceResult.error.message);
      return;
    }
    if (!summaryResult.ok) {
      setError(summaryResult.error.message);
      return;
    }
    setBalances(balanceResult.data.balances);
    setSummaries(summaryResult.data.summaries);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fills the form with a rejected balance so the manager can enter a corrected figure. */
  function startCorrection(row: BalanceRow): void {
    setBalanceMonth(row.month.slice(0, 7));
    setBalanceAmount(toTaka(row.amountPoisha));
    setBalanceNote(row.note ?? '');
    setError(null);
    setMessage(null);
  }

  async function sendBalance(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi('/api/opening-balances', 'POST', {
      month: toFirstDay(balanceMonth),
      amountPoisha: toPoisha(balanceAmount),
      note: balanceNote.trim() === '' ? null : balanceNote,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage('Opening balance sent for committee approval.');
    setBalanceAmount('');
    setBalanceNote('');
    await load();
  }

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi('/api/fund-summary', 'POST', {
      month: toFirstDay(publishMonth),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage(`${monthLabel(toFirstDay(publishMonth))} is published.`);
    setPublishMonth('');
    await load();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-bold">Fund summary</h1>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {message !== null && (
        <div
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800"
        >
          {message}
        </div>
      )}

      <h2 className="text-lg font-semibold">Opening balance</h2>
      <p className="text-sm text-muted-foreground">
        The first month in BariBondhu needs an opening balance that the committee approves before
        you can publish its summary. After that, each month opens with the previous month&apos;s
        closing balance.
      </p>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {balances.length === 0 &&
            (loaded ? (
              <p className="text-sm text-muted-foreground">No opening balance entered yet.</p>
            ) : (
              <LoadingRows label="Loading the fund…" rows={1} card={false} />
            ))}
          {balances.map((row) => (
            <div key={row.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{monthLabel(row.month)}</div>
                  <div className="text-lg font-bold">{formatMoney(row.amountPoisha)}</div>
                </div>
                <Badge variant={BALANCE_VARIANT[row.status]}>{row.status}</Badge>
              </div>
              {row.note !== null && <div className="text-sm text-muted-foreground">{row.note}</div>}
              {row.status === 'Rejected' && (
                <>
                  {row.decisionReason !== null && (
                    <div className="text-sm text-bad">
                      Committee: &quot;{row.decisionReason}&quot;
                    </div>
                  )}
                  <div>
                    <Button variant="outline" size="sm" onClick={() => startCorrection(row)}>
                      Enter a corrected balance
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance-month">Month</Label>
            <Input
              id="balance-month"
              type="month"
              className="h-12"
              value={balanceMonth}
              onChange={(event) => setBalanceMonth(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance-amount">Opening balance (taka)</Label>
            <Input
              id="balance-amount"
              inputMode="decimal"
              className="h-12"
              value={balanceAmount}
              onChange={(event) => setBalanceAmount(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance-note">Note (where the figure comes from)</Label>
            <Input
              id="balance-note"
              className="h-12"
              value={balanceNote}
              onChange={(event) => setBalanceNote(event.target.value)}
            />
          </div>
          <Button className="h-12 w-full" disabled={busy} onClick={() => void sendBalance()}>
            Send for approval
          </Button>
        </CardContent>
      </Card>

      <h2 className="mt-2 text-lg font-semibold">Publish a month</h2>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="publish-month">Month to publish</Label>
            <Input
              id="publish-month"
              type="month"
              className="h-12"
              value={publishMonth}
              onChange={(event) => setPublishMonth(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              You can publish once the month has ended. Only approved expenses are counted.
            </p>
          </div>
          <Button
            className="h-12 w-full"
            disabled={busy || publishMonth === ''}
            onClick={() => void publish()}
          >
            Publish this month
          </Button>
        </CardContent>
      </Card>

      <h2 className="mt-2 text-lg font-semibold">Months</h2>
      {summaries.length === 0 && loaded && (
        <p className="text-sm text-muted-foreground">No month published yet.</p>
      )}
      {summaries.map((row) => (
        <Card key={row.id}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">{monthLabel(row.month)}</div>
              <Badge variant={SUMMARY_VARIANT[row.status]}>{row.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground">Opening balance</div>
                <div className="font-semibold">{formatMoney(row.openingBalancePoisha)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Collected</div>
                <div className="font-semibold">{formatMoney(row.totalCollectedPoisha)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Closing balance</div>
                <div className="font-semibold">{formatMoney(row.closingBalancePoisha)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Outstanding (total only)</div>
                <div className="font-semibold">{formatMoney(row.totalOutstandingPoisha)}</div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Spent: Repairs {formatMoney(row.spentRepairPoisha)} · Salaries{' '}
              {formatMoney(row.spentSalaryPoisha)} · Utilities {formatMoney(row.spentUtilityPoisha)}{' '}
              · Other {formatMoney(row.spentOtherPoisha)}
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-sm text-muted-foreground">
        Residents and the committee see totals only, never which flats owe money.
      </p>
    </div>
  );
}
