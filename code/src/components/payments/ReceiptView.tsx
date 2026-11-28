'use client';

/**
 * The receipt of a Paid bill (RES-01 c3, UC-R08, R-Receipt): the receipt number, when and how it was paid, the
 * gateway's transaction id, the flat and month, and each charge with the total. "Download or print" opens the
 * browser's print dialog, which can also save it as a PDF; the app's menus are left off the printout.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck, Printer } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import type { ReceiptView as Receipt } from '@/services/myBillsService';
import { formatBillMoment, formatBillMonth, lineLabel } from './billView';
import { LoadingBlock } from '@/components/Loading';

/** Props for {@link ReceiptView}. */
export interface ReceiptViewProps {
  /** The bill, from the URL. */
  billId: string;
}

/** A receipt as the API sends it: dates arrive as text. */
type ReceiptBody = Omit<Receipt, 'paidAt'> & { paidAt: string };

/**
 * The receipt.
 * @param props - The bill id.
 * @returns The page content.
 */
export function ReceiptView({ billId }: ReceiptViewProps) {
  const [receipt, setReceipt] = useState<ReceiptBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const answer = await callApi<ReceiptBody>(
        `/api/bills/${encodeURIComponent(billId)}/receipt`,
        'GET',
      );
      if (answer.ok) setReceipt(answer.data);
      else setError(answer.error.message);
    })();
  }, [billId]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <h1 className="text-xl font-bold print:hidden">Receipt</h1>

      {error && (
        <>
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/resident/dues">Back to Dues</Link>
          </Button>
        </>
      )}
      {!receipt && !error && <LoadingBlock label="Loading the receipt…" />}

      {receipt && (
        <>
          <div className="flex flex-col items-center gap-2.5 pt-2 text-center">
            <span
              className="grid size-18 place-items-center rounded-full bg-ok-bg text-ok"
              aria-hidden="true"
            >
              <CircleCheck className="size-9" />
            </span>
            <h2 className="text-2xl font-bold">Paid</h2>
            <p className="text-3xl font-bold tabular-nums">{formatTaka(receipt.totalPoisha)}</p>
            <p className="text-sm text-muted-foreground">
              {formatBillMonth(receipt.billingMonth)} bill · {receipt.flatLabel}
            </p>
          </div>

          <Card className="gap-0 px-4 py-1">
            <dl className="divide-y divide-border">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3">
                <dt className="text-sm text-muted-foreground">Receipt number</dt>
                <dd className="font-mono text-sm font-semibold">{receipt.receiptNumber}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3">
                <dt className="text-sm text-muted-foreground">Paid on</dt>
                <dd>{formatBillMoment(receipt.paidAt)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3">
                <dt className="text-sm text-muted-foreground">Method</dt>
                <dd>Online (test gateway)</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3">
                <dt className="text-sm text-muted-foreground">Transaction ID</dt>
                <dd className="font-mono text-sm font-semibold break-all">
                  {receipt.gatewayTransactionId}
                </dd>
              </div>
            </dl>
          </Card>

          <section aria-labelledby="receipt-charges" className="flex flex-col gap-2">
            <h3 id="receipt-charges" className="font-semibold">
              Charges
            </h3>
            <Card className="gap-0 px-4 py-1">
              <dl className="divide-y divide-border">
                {receipt.lines.map((line, index) => (
                  <div key={`${line.type}-${index}`} className="flex justify-between gap-3 py-2.5">
                    <dt className="min-w-0">{lineLabel(line)}</dt>
                    <dd className="tabular-nums">{formatTaka(line.amountPoisha)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 py-3 font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatTaka(receipt.totalPoisha)}</dd>
                </div>
              </dl>
            </Card>
          </section>

          <p className="text-sm text-muted-foreground">
            Marked Paid only after the payment gateway confirmed it.
          </p>

          <div className="flex flex-col gap-2.5 print:hidden">
            <Button onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Download or print
            </Button>
            <Button asChild variant="ghost">
              <Link href="/resident/dues">Back to Dues</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
