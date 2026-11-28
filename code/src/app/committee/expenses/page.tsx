'use client';

/**
 * Approve expenses page for committee members (`/committee/expenses`, C-Expense, CM-02): lists the expenses that
 * wait for a decision, lets the member approve one or reject it with a reason, and shows the ones already decided.
 * Every rule (a reason is needed, an expense is decided once) is checked by the service behind
 * `/api/expenses/[id]/decision`.
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

type Category = 'repair' | 'salary' | 'utility' | 'other';

type Status = 'Waiting for approval' | 'Approved' | 'Rejected';

interface ExpenseRow {
  id: string;
  amountPoisha: number;
  expenseDate: string;
  category: Category;
  description: string;
  receiptPhoto: string | null;
  status: Status;
  correctsExpenseId: string | null;
  editNote: string | null;
  decisionReason: string | null;
}

interface ExpensesResponse {
  expenses: ExpenseRow[];
}

const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  repair: 'Repair',
  salary: 'Salary',
  utility: 'Utility',
  other: 'Other',
};

const STATUS_VARIANT: Readonly<Record<Status, 'warn' | 'ok' | 'bad'>> = {
  'Waiting for approval': 'warn',
  Approved: 'ok',
  Rejected: 'bad',
};

/** Money for reading, like ৳18,500.00; a minus sign comes first for a correcting amount. */
function formatMoney(poisha: number): string {
  const sign = poisha < 0 ? '\u2212' : '';
  const taka = Math.abs(poisha) / 100;
  return `${sign}\u09F3${taka.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A date for reading, like 10 Nov 2026. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
}

/** The month name of a date, like "November". */
function monthName(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'the';
  return date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'Asia/Dhaka' });
}

/**
 * The Approve expenses page for the committee.
 * @returns The expenses waiting for a decision and the decided ones.
 */
export default function CommitteeExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<ExpensesResponse>('/api/expenses', 'GET');
    setLoaded(true);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setExpenses(result.data.expenses);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map(expenses.map((row) => [row.id, row]));
  const waiting = expenses.filter((row) => row.status === 'Waiting for approval');
  const decided = expenses.filter((row) => row.status !== 'Waiting for approval');

  async function approve(row: ExpenseRow): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi(`/api/expenses/${row.id}/decision`, 'POST', {
      decision: 'approve',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      await load();
      return;
    }
    setMessage(
      `Approved. It now counts in ${monthName(row.expenseDate)}'s fund summary. It can't be edited; mistakes are fixed with a correcting expense.`,
    );
    await load();
  }

  async function reject(row: ExpenseRow): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await callApi(`/api/expenses/${row.id}/decision`, 'POST', {
      decision: 'reject',
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage('Rejected. The manager can see your reason and send it again.');
    setRejectingId(null);
    setReason('');
    await load();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Approve expenses</h1>

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
      {waiting.length === 0 &&
        (loaded ? (
          <p className="text-sm text-muted-foreground">No expenses are waiting.</p>
        ) : (
          <LoadingRows label="Loading expenses…" rows={2} />
        ))}
      {waiting.map((row) => {
        const corrected =
          row.correctsExpenseId === null ? undefined : byId.get(row.correctsExpenseId);
        return (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-base font-semibold">{row.description}</div>
                <Badge variant={STATUS_VARIANT[row.status]}>Waiting</Badge>
              </div>
              <div className="text-2xl font-bold">{formatMoney(row.amountPoisha)}</div>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Category</span>
                  <span>{CATEGORY_LABELS[row.category]}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Expense date</span>
                  <span>{formatDate(row.expenseDate)}</span>
                </div>
                {row.editNote !== null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Note</span>
                    <span className="text-right">{row.editNote}</span>
                  </div>
                )}
                {row.receiptPhoto !== null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Receipt photo</span>
                    <span className="break-all text-right">{row.receiptPhoto}</span>
                  </div>
                )}
                {corrected !== undefined && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Corrects</span>
                    <span className="text-right">{corrected.description}</span>
                  </div>
                )}
              </div>

              {rejectingId === row.id ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`reason-${row.id}`}>Why is it rejected?</Label>
                  <Input
                    id={`reason-${row.id}`}
                    className="h-12"
                    placeholder="The manager sees this reason"
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
        );
      })}

      <h2 className="mt-2 text-lg font-semibold">Decided</h2>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {decided.length === 0 && loaded && (
            <p className="text-sm text-muted-foreground">No expenses decided yet.</p>
          )}
          {decided.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{row.description}</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(row.expenseDate)} · {CATEGORY_LABELS[row.category]} ·{' '}
                  {formatMoney(row.amountPoisha)}
                </div>
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
