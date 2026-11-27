'use client';

/**
 * Overpayments for the manager (`/manager/overpayments`, the "Overpayments to refund" part of prototype
 * `M-Claims.html` and `M-Claims-Mobile.html`, BB-0614): money paid through the gateway for a bill that was already
 * settled (BR-04). The manager returns it outside the app, then marks it Refunded (BM-04). A confirm step comes first,
 * because Refunded is final. One card per overpayment on phones, a table from 1024 px.
 *
 * @author Mahir Al Kamal
 */
import { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import type { OverpaymentRow } from '@/services/overpaymentService';
import { formatBillMonth, formatBillMoment } from './billView';

/** An overpayment as the API sends it: dates are text. */
export type OverpaymentJson = Omit<OverpaymentRow, 'flaggedAt' | 'refundedAt'> & {
  flaggedAt: string;
  refundedAt: string | null;
};

/**
 * The line saying what happened to an overpayment.
 * @param row - The overpayment.
 * @returns When it was flagged, or when and by whom it was refunded.
 */
export function overpaymentStatusLine(row: OverpaymentJson): string {
  if (row.status === 'Refunded' && row.refundedAt) {
    const by = row.refundedByName ? ` by ${row.refundedByName}` : '';
    return `Refunded ${formatBillMoment(row.refundedAt)}${by}`;
  }
  return `Flagged ${formatBillMoment(row.flaggedAt)}`;
}

/** Why it's flagged, as the prototype words it. */
function reason(row: OverpaymentJson): string {
  return `Paid online again for the ${formatBillMonth(row.billingMonth)} bill after it was settled`;
}

/**
 * The manager's overpayments page.
 * @returns The page content.
 */
export function ManagerOverpayments() {
  const [rows, setRows] = useState<OverpaymentJson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OverpaymentJson | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const answer = await callApi<{ overpayments: OverpaymentJson[] }>('/api/overpayments', 'GET');
    if (answer.ok) {
      setRows(answer.data.overpayments);
      setError(null);
    } else {
      setError(answer.error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRefunded(row: OverpaymentJson) {
    setSaving(true);
    const answer = await callApi(`/api/overpayments/${row.id}/refund`, 'POST');
    setSaving(false);
    setConfirming(null);
    // Reload first: a successful reload clears old errors, so a refusal is shown after it.
    await load();
    if (answer.ok) {
      toast.success(`Marked refunded: ${formatTaka(row.amountPoisha)} to ${row.flatLabel}`);
    } else {
      setError(answer.error.message);
    }
  }

  const flagged = rows?.filter((row) => row.status === 'Flagged') ?? [];

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-[1.375rem] font-bold">Overpayments</h1>
        <p className="text-base text-muted-foreground">
          Refund the money outside the app, then mark it refunded.
        </p>
      </div>

      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {rows === null && !error && <p className="text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && (
        <Card className="p-4 text-muted-foreground">No overpayments. Nobody has paid twice.</Card>
      )}
      {rows && rows.length > 0 && (
        <p className="text-base font-semibold">
          {flagged.length === 0
            ? 'All overpayments are refunded.'
            : `${flagged.length} to refund · ${formatTaka(
                flagged.reduce((sum, row) => sum + row.amountPoisha, 0),
              )}`}
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          {/* Phones and tablets: one card per overpayment. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-base font-semibold">{row.flatLabel}</span>
                    <StatusBadge row={row} />
                  </div>
                  <span className="text-[1.375rem] font-bold">{formatTaka(row.amountPoisha)}</span>
                  <span className="text-sm">{reason(row)}</span>
                  <span className="text-sm text-muted-foreground">
                    {overpaymentStatusLine(row)} · Gateway {row.gatewayTransactionId}
                  </span>
                  {row.status === 'Flagged' && (
                    <Button className="mt-1 min-h-12 w-full" onClick={() => setConfirming(row)}>
                      Mark refunded
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>

          {/* From 1024 px: a table. */}
          <Card className="hidden p-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Flat</TableHead>
                  <TableHead>Why it&apos;s flagged</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 font-semibold">{row.flatLabel}</TableCell>
                    <TableCell className="whitespace-normal">
                      {reason(row)}
                      <span className="block text-sm text-muted-foreground">
                        {overpaymentStatusLine(row)} · Gateway {row.gatewayTransactionId}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatTaka(row.amountPoisha)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge row={row} />
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      {row.status === 'Flagged' && (
                        <Button className="min-h-12" onClick={() => setConfirming(row)}>
                          Mark refunded
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent showCloseButton={false}>
          {confirming && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">Mark this overpayment refunded?</DialogTitle>
                <DialogDescription className="text-[15px]">
                  Only do this after you have returned {formatTaka(confirming.amountPoisha)} to{' '}
                  {confirming.flatLabel}. It can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="min-h-12" disabled={saving}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  className="min-h-12"
                  disabled={saving}
                  onClick={() => void markRefunded(confirming)}
                >
                  {saving ? 'Saving…' : 'Mark refunded'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Flagged or Refunded. */
function StatusBadge({ row }: { row: OverpaymentJson }) {
  return (
    <Badge variant={row.status === 'Flagged' ? 'info' : 'ok'}>
      {row.status === 'Flagged' ? 'To refund' : 'Refunded'}
    </Badge>
  );
}
