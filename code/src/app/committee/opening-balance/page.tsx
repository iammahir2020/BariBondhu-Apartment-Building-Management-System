'use client';

/**
 * Opening balance page for committee members (`/committee/opening-balance`, CM-02): lists the opening balances the
 * manager entered, lets the member approve one or reject it with a reason. Every rule (a reason is needed, a
 * balance is decided once) is checked by the service behind `/api/opening-balances/[id]/decision`.
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

type BalanceStatus = 'Waiting for approval' | 'Approved' | 'Rejected';

interface BalanceRow {
  id: string;
  month: string;
  amountPoisha: number;
  note: string | null;
  status: BalanceStatus;
  decisionReason: string | null;
}

interface BalancesResponse {
  balances: BalanceRow[];
}

const STATUS_VARIANT: Readonly<Record<BalanceStatus, 'warn' | 'ok' | 'bad'>> = {
  'Waiting for approval': 'warn',
  Approved: 'ok',
  Rejected: 'bad',
};

/** Money for reading, like ৳3,12,400.00. */
function formatMoney(poisha: number): string {
  const taka = Math.abs(poisha) / 100;
  return `${poisha < 0 ? '\u2212' : ''}\u09F3${taka.toLocaleString('en-US', {
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

/**
 * The Opening balance page for the committee.
 * @returns The opening balances waiting for a decision and the decided ones.
 */
export default function CommitteeOpeningBalancePage() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<BalancesResponse>('/api/opening-balances', 'GET');
    setLoaded(true);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setBalances(result.data.balances);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = balances.filter((row) => row.status === 'Waiting for approval');
  const decided = balances.filter((row) => row.status !== 'Waiting for approval');

  async function approve(row: BalanceRow): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi(`/api/opening-balances/${row.id}/decision`, 'POST', {
      decision: 'approve',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      await load();
      return;
    }
    setMessage(
      `Approved. The manager can now publish ${monthLabel(row.month)}'s fund summary. Approved is final.`,
    );
    await load();
  }

  async function reject(row: BalanceRow): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi(`/api/opening-balances/${row.id}/decision`, 'POST', {
      decision: 'reject',
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage('Rejected. The manager can see your reason and enter a corrected figure.');
    setRejectingId(null);
    setReason('');
    await load();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Opening balance</h1>
      <p className="text-sm text-muted-foreground">
        The manager can&apos;t publish the first fund summary until you approve this figure.
      </p>

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

      <h2 className="text-lg font-semibold">Waiting for your decision</h2>
      {waiting.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {loaded ? 'No opening balance is waiting.' : 'Loading…'}
        </p>
      )}
      {waiting.map((row) => (
        <Card key={row.id}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-base font-semibold">
                Opening balance for {monthLabel(row.month)}
              </div>
              <Badge variant={STATUS_VARIANT[row.status]}>Waiting</Badge>
            </div>
            <div className="text-2xl font-bold">{formatMoney(row.amountPoisha)}</div>
            {row.note !== null && (
              <div className="text-sm text-muted-foreground">Manager&apos;s note: {row.note}</div>
            )}

            {rejectingId === row.id ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`reason-${row.id}`}>Why is it rejected?</Label>
                <Input
                  id={`reason-${row.id}`}
                  className="h-12"
                  placeholder="The manager sees this and enters a corrected figure"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="h-12 grow"
                    disabled={busy}
                    onClick={() => {
                      setRejectingId(null);
                      setReason('');
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-12 grow"
                    disabled={busy}
                    onClick={() => void reject(row)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="h-12 grow"
                  disabled={busy}
                  onClick={() => {
                    setRejectingId(row.id);
                    setReason('');
                    setError(null);
                    setMessage(null);
                  }}
                >
                  Reject
                </Button>
                <Button className="h-12 grow" disabled={busy} onClick={() => void approve(row)}>
                  Approve
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <h2 className="mt-2 text-lg font-semibold">Decided</h2>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {decided.length === 0 && loaded && (
            <p className="text-sm text-muted-foreground">Nothing decided yet.</p>
          )}
          {decided.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{monthLabel(row.month)}</div>
                <div className="text-sm text-muted-foreground">{formatMoney(row.amountPoisha)}</div>
                {row.status === 'Rejected' && row.decisionReason !== null && (
                  <div className="text-sm text-bad">Reason: {row.decisionReason}</div>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
