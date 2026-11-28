'use client';

/**
 * Building Manager Monthly Bills page.
 * BB-0509, BM-03.
 *
 * Generate, view and correct monthly bills.
 *
 * @author Jannatul Ferdus Nishi
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';

type BillStatus =
  'Unpaid' | 'Payment pending' | 'Awaiting verification' | 'Paid' | 'Carried forward';

interface BillRow {
  id: string;
  flatId: string;
  occupancyId: string | null;
  flatNumber: string | null;
  blockName?: string | null;
  householdName: string | null;
  billingMonth: string;
  dueDate: string;
  totalPoisha: number;
  status: BillStatus;
}

interface BillsResponse {
  bills: BillRow[];
}

type StatusFilter = 'All' | BillStatus;

function nextBillingMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The flat with its block, like `A-3B`, so the same flat number in two blocks can be told apart.
 * @param bill - The bill row.
 * @returns The flat's short name, or "Unknown" when the flat is missing.
 */
function billFlat(bill: Pick<BillRow, 'flatNumber' | 'blockName'>): string {
  if (bill.flatNumber === null) return 'Unknown';
  return bill.blockName ? `${bill.blockName}-${bill.flatNumber}` : bill.flatNumber;
}

function formatMoney(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMonth(month: string): string {
  return new Date(`${month.slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
  });
}

const FILTERS: StatusFilter[] = [
  'All',
  'Unpaid',
  'Payment pending',
  'Awaiting verification',
  'Paid',
  'Carried forward',
];

/**
 * Manager bill management screen.
 */
export default function ManagerBillsPage() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [billingMonth, setBillingMonth] = useState(nextBillingMonth);

  const [dueDate, setDueDate] = useState(() => {
    return `${nextBillingMonth()}-20`;
  });

  const [filterMonth, setFilterMonth] = useState('All');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('All');

  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);

  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    const result = await callApi<BillsResponse>('/api/manager/bills', 'GET');

    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setBills(result.data.bills);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);

  const availableMonths = useMemo(() => {
    return [...new Set(bills.map((b) => b.billingMonth.slice(0, 7)))].sort((a, b) =>
      b.localeCompare(a),
    );
  }, [bills]);

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const monthMatches = filterMonth === 'All' || bill.billingMonth.startsWith(filterMonth);

      const statusMatches = filterStatus === 'All' || bill.status === filterStatus;

      return monthMatches && statusMatches;
    });
  }, [bills, filterMonth, filterStatus]);

  const unpaidCount = filteredBills.filter((bill) => bill.status === 'Unpaid').length;

  const paidCount = filteredBills.filter((bill) => bill.status === 'Paid').length;

  async function generateBills(): Promise<void> {
    setError(null);
    setSuccess(null);

    if (!billingMonth || !dueDate) {
      setError('Choose the billing month and due date.');
      return;
    }

    const monthStart = `${billingMonth}-01`;

    if (dueDate < monthStart) {
      setError('Check the due date.');
      return;
    }

    if (!window.confirm(`Generate monthly bills for ${formatMonth(monthStart)}?`)) {
      return;
    }

    setSaving(true);

    const result = await callApi('/api/manager/bills', 'POST', {
      billingMonth: monthStart,
      dueDate,
    });

    if (!result.ok) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSuccess('Monthly bills generated successfully.');
    setFilterMonth(billingMonth);
    setFilterStatus('All');

    await loadBills();
    setSaving(false);
  }

  async function correctBill(): Promise<void> {
    if (!selectedBill) return;

    setError(null);
    setSuccess(null);

    const amount = adjustment.trim();

    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Enter a valid adjustment amount in taka.');
      return;
    }

    const adjustmentPoisha = Math.round(Number(amount) * 100);

    if (!Number.isSafeInteger(adjustmentPoisha) || adjustmentPoisha === 0) {
      setError('Enter a non-zero adjustment amount.');
      return;
    }

    if (!reason.trim()) {
      setError('Write a reason for the correction.');
      return;
    }

    setSaving(true);

    const result = await callApi(`/api/manager/bills/${selectedBill.id}/correct`, 'POST', {
      adjustmentPoisha,
      reason: reason.trim(),
    });

    if (!result.ok) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSuccess('Bill corrected successfully.');
    setSelectedBill(null);
    setAdjustment('');
    setReason('');

    await loadBills();
    setSaving(false);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Monthly bills</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate, view and correct monthly bills.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-teal-300 bg-teal-50 p-4 text-teal-900"
        >
          {success}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <section>
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-lg font-semibold">Make monthly bills</h2>

              <p className="text-sm text-muted-foreground">
                Uses the committee&apos;s current rates. Existing bills keep their original charges.
              </p>

              <div className="space-y-2">
                <Label htmlFor="billing-month">Billing month</Label>
                <Input
                  id="billing-month"
                  type="month"
                  value={billingMonth}
                  onChange={(event) => {
                    const month = event.target.value;
                    setBillingMonth(month);
                    setDueDate(month ? `${month}-20` : '');
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bill-due-date">Due date</Label>
                <Input
                  id="bill-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <Button className="w-full" disabled={saving} onClick={() => void generateBills()}>
                {saving ? 'Please wait...' : 'Generate bills'}
              </Button>

              <p className="text-xs text-muted-foreground">
                A month cannot be generated twice. Earlier eligible unpaid balances and credits are
                handled automatically.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-2xl font-bold">{filteredBills.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="text-xs text-muted-foreground">Unpaid</div>
                <div className="text-2xl font-bold">{unpaidCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="text-xs text-muted-foreground">Paid</div>
                <div className="text-2xl font-bold">{paidCount}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              aria-label="Filter by month"
              className="min-h-12 rounded-lg border bg-background px-3"
              value={filterMonth}
              onChange={(event) => setFilterMonth(event.target.value)}
            >
              <option value="All">All months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by status"
              className="min-h-12 rounded-lg border bg-background px-3"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as StatusFilter)}
            >
              {FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Button variant="outline" onClick={() => void loadBills()}>
              Refresh
            </Button>
          </div>

          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-lg font-semibold">All bills</h2>

              {loading ? (
                <p role="status">Loading bills...</p>
              ) : filteredBills.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No bills found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-3">Flat</th>
                        <th className="p-3">Household</th>
                        <th className="p-3">Month</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map((bill) => (
                        <tr key={bill.id} className="border-b">
                          <td className="p-3 font-semibold">{billFlat(bill)}</td>
                          <td className="p-3">{bill.householdName ?? 'Vacant'}</td>
                          <td className="p-3">{formatMonth(bill.billingMonth)}</td>
                          <td className="p-3 text-right font-medium">
                            {formatMoney(bill.totalPoisha)}
                          </td>
                          <td className="p-3">{bill.status}</td>
                          <td className="p-3">
                            {bill.status === 'Unpaid' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedBill(bill);
                                  setAdjustment('');
                                  setReason('');
                                  setError(null);
                                }}
                              >
                                Correct
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">No correction</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {selectedBill && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold">Correct unpaid bill</h2>

            <p className="text-sm">
              Flat {billFlat(selectedBill)}
              {' · '}
              {formatMoney(selectedBill.totalPoisha)}
            </p>

            <div className="space-y-2">
              <Label htmlFor="adjustment">Adjustment amount (৳)</Label>
              <Input
                id="adjustment"
                type="text"
                inputMode="decimal"
                placeholder="For example, -500"
                value={adjustment}
                onChange={(event) => setAdjustment(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use a negative value to reduce a bill, or a positive value to increase it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="correction-reason">Reason for correction</Label>
              <textarea
                id="correction-reason"
                className="min-h-24 w-full rounded-lg border bg-background p-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled={saving} onClick={() => void correctBill()}>
                Save correction
              </Button>

              <Button variant="outline" disabled={saving} onClick={() => setSelectedBill(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
