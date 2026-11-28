'use client';

/**
 * Expenses page for the manager (`/manager/expenses`, M-Expenses, BM-08): lists every expense with its status,
 * records a new expense, edits one that is waiting, resubmits a rejected one, and adds a correcting expense to an
 * Approved one. Taka are turned into poisha here because the API takes whole poisha; every rule is checked by the
 * service behind `/api/expenses`.
 *
 * @author Ayesha Siddiqa
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { callApi } from '@/lib/apiClient';

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

/** What the form is doing: recording a new expense, or changing the one with this id. */
type FormMode = { kind: 'record' } | { kind: 'edit' | 'resubmit' | 'correct'; id: string };

const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'salary', label: 'Salary' },
  { value: 'utility', label: 'Utility' },
  { value: 'other', label: 'Other' },
];

const STATUS_VARIANT: Readonly<Record<Status, 'warn' | 'ok' | 'bad'>> = {
  'Waiting for approval': 'warn',
  Approved: 'ok',
  Rejected: 'bad',
};

const FORM_TITLES: Readonly<Record<FormMode['kind'], string>> = {
  record: 'Record an expense',
  edit: 'Edit this expense',
  resubmit: 'Resubmit this expense',
  correct: 'Add a correcting expense',
};

const SAVED_MESSAGES: Readonly<Record<FormMode['kind'], string>> = {
  record: 'Expense sent for committee approval.',
  edit: 'Change saved. The expense is still waiting for approval.',
  resubmit: 'Expense sent again for committee approval.',
  correct: 'Correcting expense sent for committee approval.',
};

/** Whole poisha to a plain taka number for an input, like 1850000 to "18500". */
function toTaka(poisha: number): string {
  return (poisha / 100).toString();
}

/** Money for reading, like \u09F31,95,000.00; a minus sign comes first for a correcting amount. */
function formatMoney(poisha: number): string {
  const sign = poisha < 0 ? '\u2212' : '';
  const taka = Math.abs(poisha) / 100;
  return `${sign}\u09F3${taka.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** What the manager typed to whole poisha; null when blank or not a number. */
function toPoisha(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const taka = Number(trimmed);
  return Number.isFinite(taka) ? Math.round(taka * 100) : null;
}

/** A date for reading, like 13 Nov 2026. */
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

/** The label of a category, like "repair" to "Repair". */
function categoryLabel(category: Category): string {
  return CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}

/**
 * The Expenses page for the manager.
 * @returns The expense list and the form to record or change an expense.
 */
export default function ManagerExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<FormMode>({ kind: 'record' });
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  /** Empties the form and goes back to recording a new expense. */
  function resetForm(): void {
    setMode({ kind: 'record' });
    setAmount('');
    setExpenseDate('');
    setCategory('');
    setDescription('');
    setReceipt('');
    setNote('');
  }

  /** Fills the form from an expense so the manager can edit, resubmit or correct it. */
  function startChange(row: ExpenseRow, kind: 'edit' | 'resubmit' | 'correct'): void {
    setMode({ kind, id: row.id });
    setError(null);
    setMessage(null);
    setNote('');
    setCategory(row.category);
    setDescription(kind === 'correct' ? '' : row.description);
    setReceipt(kind === 'correct' ? '' : (row.receiptPhoto ?? ''));
    setAmount(kind === 'correct' ? '' : toTaka(row.amountPoisha));
    setExpenseDate(kind === 'correct' ? '' : row.expenseDate);
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    const fields = {
      amountPoisha: toPoisha(amount),
      expenseDate: expenseDate === '' ? null : expenseDate,
      category: category === '' ? null : category,
      description,
      receiptPhoto: receipt.trim() === '' ? null : receipt.trim(),
    };
    const result =
      mode.kind === 'record'
        ? await callApi('/api/expenses', 'POST', fields)
        : await callApi(`/api/expenses/${mode.id}`, 'PATCH', {
            ...fields,
            action: mode.kind,
            note,
          });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage(SAVED_MESSAGES[mode.kind]);
    resetForm();
    await load();
  }

  const byId = new Map(expenses.map((row) => [row.id, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-bold">Expenses</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="flex flex-col gap-2">
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Expense</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        {loaded ? 'No expenses yet.' : 'Loading…'}
                      </TableCell>
                    </TableRow>
                  )}
                  {expenses.map((row) => {
                    const corrected =
                      row.correctsExpenseId === null ? undefined : byId.get(row.correctsExpenseId);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.expenseDate)}</TableCell>
                        <TableCell className="whitespace-normal">
                          {row.description}
                          {row.status === 'Rejected' && row.decisionReason !== null && (
                            <div className="text-sm text-bad">
                              Committee: &quot;{row.decisionReason}&quot;
                            </div>
                          )}
                          {corrected !== undefined && (
                            <div className="text-sm text-muted-foreground">
                              Linked to &quot;{corrected.description}&quot;
                            </div>
                          )}
                          {row.editNote !== null && row.status === 'Waiting for approval' && (
                            <div className="text-sm text-muted-foreground">
                              Note: {row.editNote}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{categoryLabel(row.category)}</TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.amountPoisha)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.status === 'Waiting for approval' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startChange(row, 'edit')}
                            >
                              Edit
                            </Button>
                          )}
                          {row.status === 'Rejected' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startChange(row, 'resubmit')}
                            >
                              Resubmit
                            </Button>
                          )}
                          {row.status === 'Approved' && row.correctsExpenseId === null && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startChange(row, 'correct')}
                            >
                              Add correction
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Approved expenses can&apos;t be edited or deleted. Fix them with a correcting expense,
            which also needs approval.
          </p>
        </section>

        <aside>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{FORM_TITLES[mode.kind]}</h2>

              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-amount">Amount (taka)</Label>
                <Input
                  id="expense-amount"
                  inputMode="decimal"
                  className="h-12"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                {mode.kind === 'correct' && (
                  <p className="text-sm text-muted-foreground">
                    Enter a minus amount to reduce the expense, like -2000.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-date">Expense date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  className="h-12"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(value) =>
                    setCategory(CATEGORIES.find((entry) => entry.value === value)?.value ?? '')
                  }
                >
                  <SelectTrigger id="expense-category" className="h-12 w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-description">Description</Label>
                <Input
                  id="expense-description"
                  className="h-12"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-receipt">Receipt photo path (optional)</Label>
                <Input
                  id="expense-receipt"
                  className="h-12"
                  value={receipt}
                  onChange={(event) => setReceipt(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">JPG or PNG, up to 5 MB.</p>
              </div>

              {mode.kind === 'edit' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="expense-note">Note about the change</Label>
                  <Input
                    id="expense-note"
                    className="h-12"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              )}

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

              <Button className="h-12 w-full" disabled={saving} onClick={() => void submit()}>
                Send for committee approval
              </Button>
              {mode.kind !== 'record' && (
                <Button variant="outline" className="h-12 w-full" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
