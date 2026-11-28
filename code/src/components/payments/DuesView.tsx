'use client';

/**
 * Dues (RES-01, UC-R04, R-Dues): my household's bill to pay, with each charge, the total and the due date, and Pay
 * online while it is Unpaid (BR-03). While a payment is pending it checks again every few seconds, so the bill turns
 * Paid on its own once the gateway confirms, even after the resident came back from the checkout or reopened the
 * app (TC-R01-06). What the checkout page says never changes the bill; only the server does (TC-R01-12).
 *
 * @author Mahir Al Kamal
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Clock, FileText, Repeat } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import type { MyBillView } from '@/services/myBillsService';
import {
  BILL_STATUS_BADGE,
  currentBill,
  formatBillDay,
  formatBillMonth,
  lineLabel,
  overpaymentMessages,
} from './billView';
import { LoadingRows } from '@/components/Loading';

/** How often Dues checks again while a payment is pending. */
export const PENDING_REFRESH_MS = 10_000;

/**
 * The receipt page of a bill.
 * @param billId - The bill.
 * @returns Its path.
 */
export function receiptPath(billId: string): string {
  return `/resident/dues/${billId}/receipt`;
}

/** The status badge of a bill. */
function StatusBadge({ status }: { status: MyBillView['status'] }) {
  const badge = BILL_STATUS_BADGE[status];
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

/** What the earlier-bills list says under a bill's month. */
function earlierBillLine(bill: MyBillView): string {
  if (bill.status === 'Paid') {
    return bill.receiptNumber ? `Paid · receipt ${bill.receiptNumber}` : 'Paid';
  }
  if (bill.status === 'Carried forward') return 'Carried forward to a newer bill';
  return `Due ${formatBillDay(bill.dueDate)}`;
}

/**
 * Dues.
 * @returns The page content.
 */
export function DuesView() {
  const router = useRouter();
  const [bills, setBills] = useState<MyBillView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const answer = await callApi<{ bills: MyBillView[] }>('/api/bills/mine', 'GET');
    if (answer.ok) setBills(answer.data.bills);
    else setError(answer.error.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = bills ? currentBill(bills) : null;
  const earlier = bills?.filter((bill) => bill !== current) ?? [];
  const pending = current?.status === 'Payment pending';

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), PENDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function pay(bill: MyBillView) {
    setPaying(bill.id);
    setError(null);
    const answer = await callApi<{ checkoutUrl: string }>(`/api/bills/${bill.id}/payments`, 'POST');
    if (answer.ok) {
      router.push(answer.data.checkoutUrl);
      return;
    }
    setPaying(null);
    setError(answer.error.message);
    await load();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5">
      <h1 className="text-xl font-bold">Dues</h1>

      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {bills &&
        overpaymentMessages(bills).map((message) => (
          <Alert key={message.key} variant={message.refunded ? 'ok' : 'info'}>
            <Repeat aria-hidden="true" />
            <AlertTitle>{message.title}</AlertTitle>
            <AlertDescription>{message.detail}</AlertDescription>
          </Alert>
        ))}

      {bills === null && !error && <LoadingRows label="Loading your bills…" rows={2} />}
      {bills?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No bills yet. Your monthly bill shows here once the manager makes it.
        </p>
      )}
      {bills && bills.length > 0 && !current && (
        <Alert variant="ok">
          <AlertDescription>Nothing to pay. All your bills are settled.</AlertDescription>
        </Alert>
      )}

      {current && (
        <>
          <Card
            role="region"
            aria-label={`${formatBillMonth(current.billingMonth)} bill`}
            className="gap-1 p-4"
          >
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{formatBillMonth(current.billingMonth)}</h2>
                <p className="text-sm text-muted-foreground">
                  Due {formatBillDay(current.dueDate)}
                </p>
              </div>
              <StatusBadge status={current.status} />
            </div>
            <dl className="flex flex-col">
              {current.lines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className="flex justify-between gap-3 border-b border-border py-2.5"
                >
                  <dt className="min-w-0">{lineLabel(line)}</dt>
                  <dd className="font-medium tabular-nums">{formatTaka(line.amountPoisha)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-3 text-lg font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatTaka(current.totalPoisha)}</dd>
              </div>
            </dl>
          </Card>

          {current.paymentProblem && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Your last payment didn&apos;t go through</AlertTitle>
              <AlertDescription>{current.paymentProblem}</AlertDescription>
            </Alert>
          )}
          {pending && (
            <Alert>
              <Clock aria-hidden="true" />
              <AlertTitle>Waiting for the payment gateway</AlertTitle>
              <AlertDescription>
                We&apos;ll mark it Paid as soon as the gateway confirms, even if you close the app.
                If nothing arrives in 30 minutes, you can pay again.
              </AlertDescription>
            </Alert>
          )}
          {current.status === 'Awaiting verification' && (
            <Alert>
              <Clock aria-hidden="true" />
              <AlertTitle>The manager is checking your cash payment</AlertTitle>
              <AlertDescription>
                You won&apos;t be listed as late while it is checked.
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={!current.canPay || paying !== null}
            onClick={() => void pay(current)}
          >
            {paying === current.id
              ? 'Opening the gateway…'
              : `Pay ${formatTaka(current.totalPoisha)} online`}
          </Button>
        </>
      )}

      {earlier.length > 0 && (
        <section className="mt-1 flex flex-col gap-2" aria-labelledby="earlier-bills">
          <h2 id="earlier-bills" className="font-semibold">
            {current ? 'Earlier bills' : 'Your bills'}
          </h2>
          <Card className="gap-0 p-0">
            <ul className="divide-y divide-border">
              {earlier.map((bill) => (
                <li
                  key={bill.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{formatBillMonth(bill.billingMonth)}</h3>
                    <p className="text-sm text-muted-foreground">{earlierBillLine(bill)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatTaka(bill.totalPoisha)}</span>
                  <StatusBadge status={bill.status} />
                  {bill.receiptNumber && (
                    <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                      <Link href={receiptPath(bill.id)}>
                        <FileText aria-hidden="true" />
                        Receipt
                      </Link>
                    </Button>
                  )}
                  {bill.canPay && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={paying !== null}
                      onClick={() => void pay(bill)}
                    >
                      Pay {formatTaka(bill.totalPoisha)}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
