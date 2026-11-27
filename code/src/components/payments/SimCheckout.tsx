'use client';

/**
 * The simulated gateway's test checkout (RES-01, BB-0608, SRS v1.6): the page a resident lands on after tapping Pay.
 * It stands in for a real gateway's payment page, so it looks like a separate site and says plainly that no real
 * money moves. Its buttons pay, fail or cancel the payment, or pay and hold the confirmation back to show a late
 * one (BR-04). Back on Dues, only the gateway's confirmation decides the bill, never this page (BR-02, TC-R01-12).
 *
 * @author Mahir Al Kamal
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck, FlaskConical } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import type { GatewayPaymentStatus } from '@/services/paymentGateway';

/** Where the checkout sends the resident back to. */
export const DUES_PATH = '/resident/dues';

/** The checkout's buttons, as the API names them. */
type Choice = 'pay' | 'pay_late' | 'fail' | 'cancel';

/** What the API answers after a button. */
interface CheckoutResult {
  status: GatewayPaymentStatus;
  delivered: boolean;
  deliveryError: string | null;
}

/** Props for {@link SimCheckout}. */
export interface SimCheckoutProps {
  /** The gateway transaction, from the URL. */
  transactionId: string;
}

/** What to tell the resident about a finished transaction. */
function finishedText(result: CheckoutResult): { ok: boolean; text: string } {
  const { status, delivered, deliveryError } = result;
  if (status.state === 'Failed' || status.state === 'Cancelled') {
    return { ok: false, text: status.reason ?? 'The payment did not go through.' };
  }
  if (deliveryError) {
    return {
      ok: false,
      text: `Paid, but BariBondhu did not accept the confirmation: ${deliveryError} The app checks again within 30 minutes.`,
    };
  }
  if (delivered) return { ok: true, text: 'Paid. BariBondhu has the confirmation.' };
  return {
    ok: true,
    text: 'Paid. The confirmation is held back, so BariBondhu still shows the payment as pending.',
  };
}

/**
 * The checkout.
 * @param props - The transaction id.
 * @returns The page content.
 */
export function SimCheckout({ transactionId }: SimCheckoutProps) {
  const path = `/api/sim-gateway/transactions/${encodeURIComponent(transactionId)}`;
  const [status, setStatus] = useState<GatewayPaymentStatus | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const answer = await callApi<GatewayPaymentStatus>(path, 'GET');
    if (answer.ok) setStatus(answer.data);
    else setError(answer.error.message);
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(url: string, body?: { choice: Choice }) {
    setBusy(true);
    setError(null);
    const answer = await callApi<CheckoutResult>(url, 'POST', body);
    setBusy(false);
    if (answer.ok) {
      setResult(answer.data);
      setStatus(answer.data.status);
    } else {
      setError(answer.error.message);
    }
  }

  const pending = status?.state === 'Pending';
  const finished = result ? finishedText(result) : null;
  const canSendConfirmation =
    status?.state === 'Succeeded' && !(result?.delivered ?? false) && !busy;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="flex h-16 items-center gap-2 border-b border-border bg-card px-4">
        <FlaskConical aria-hidden="true" className="size-5 text-muted-foreground" />
        <span className="flex-1 font-semibold">Test payment gateway</span>
        <Badge variant="outline">No real money</Badge>
      </header>

      <main className="flex w-full flex-col gap-6 px-5 py-7 sm:mx-auto sm:mt-8 sm:max-w-110 sm:rounded-[20px] sm:border sm:border-border sm:bg-card sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">Pay BariBondhu</h1>
          <p className="text-sm text-muted-foreground">
            This page stands in for the bank or mobile wallet. Choose how the payment ends.
          </p>
        </div>

        {status && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-card p-4 text-[15px] sm:bg-muted">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-right text-lg font-bold">{formatTaka(status.amountPoisha)}</dd>
            <dt className="text-muted-foreground">Transaction</dt>
            <dd className="text-right font-mono text-sm break-all">{status.transactionId}</dd>
          </dl>
        )}

        <div aria-live="polite" className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {finished && (
            <Alert variant={finished.ok ? 'ok' : 'destructive'}>
              {finished.ok ? (
                <CircleCheck aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              <AlertDescription>{finished.text}</AlertDescription>
            </Alert>
          )}
          {!result && status && !pending && (
            <Alert>
              <AlertDescription>
                This payment is already{' '}
                {status.state === 'Succeeded' ? 'paid' : status.state.toLowerCase()}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {pending && (
          <div className="flex flex-col gap-2.5">
            <Button disabled={busy} onClick={() => void act(path, { choice: 'pay' })}>
              Pay {formatTaka(status.amountPoisha)}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act(path, { choice: 'pay_late' })}
            >
              Pay but confirm late
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act(path, { choice: 'fail' })}
            >
              Fail the payment
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void act(path, { choice: 'cancel' })}
            >
              Cancel
            </Button>
          </div>
        )}

        {canSendConfirmation && (
          <Button variant="outline" onClick={() => void act(`${path}/confirmation`)}>
            Send the confirmation now
          </Button>
        )}

        {status && !pending && (
          <Button asChild>
            <Link href={DUES_PATH}>Back to BariBondhu</Link>
          </Button>
        )}
      </main>
    </div>
  );
}
