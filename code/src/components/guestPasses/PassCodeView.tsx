/**
 * The Pass code screen (prototype `R-GuestPass-Code.html`, RES-03): the guest's name and status, how many people
 * and when, the 6-digit code and its QR code to show at the gate, and Share and Cancel pass while the pass is
 * still live. It also says how many guests have come in so far. Every rule and its wording come from the API.
 *
 * Share uses the phone's share sheet when there is one, and otherwise copies the message, so it works on a laptop
 * too.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Share2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { callApi } from '@/lib/apiClient';
import type { GuestPassView } from '@/lib/guestPassResponse';
import {
  PASS_STATUS_BADGE,
  canCancelPass,
  formatPassCode,
  formatPassMoment,
  formatPassWindow,
  passShareText,
  peopleText,
} from '@/components/guestPasses/passView';
import { PassQrCode } from '@/components/guestPasses/PassQrCode';
import { LoadingBlock } from '@/components/Loading';

/** Props for {@link PassCodeView}. */
export interface PassCodeViewProps {
  passId: string;
}

/** What Share did, for the line under the buttons. */
type ShareOutcome = 'copied' | 'failed' | null;

/**
 * Pass code.
 * @param props - The pass to show.
 * @returns The screen.
 */
export function PassCodeView({ passId }: PassCodeViewProps) {
  const [pass, setPass] = useState<GuestPassView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<ShareOutcome>(null);

  useEffect(() => {
    void callApi<{ pass: GuestPassView }>(`/api/guest-passes/${passId}`, 'GET').then((result) => {
      if (result.ok) setPass(result.data.pass);
      else setError(result.error.message);
    });
  }, [passId]);

  async function share(current: GuestPassView): Promise<void> {
    const text = passShareText(current);
    setShared(null);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Guest pass', text });
      } catch {
        // Closing the share sheet is not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared('copied');
    } catch {
      setShared('failed');
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await callApi<{ pass: GuestPassView }>(
      `/api/guest-passes/${passId}/cancel`,
      'POST',
    );
    setBusy(false);
    setConfirming(false);
    if (result.ok) setPass(result.data.pass);
    else setError(result.error.message);
  }

  const errorAlert = error && (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (!pass) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-xl font-bold">Guest pass</h1>
        <div aria-live="polite">{errorAlert || <LoadingBlock label="Loading the pass…" />}</div>
      </div>
    );
  }

  const remaining = pass.guestCount - pass.guestsUsed;
  const live = canCancelPass(pass.status);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Guest pass</h1>

      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h2 className="text-lg font-semibold">{pass.guestName}</h2>
          <Badge variant={PASS_STATUS_BADGE[pass.status]}>{pass.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {peopleText(pass.guestCount)} · {formatPassWindow(pass.startsAt, pass.endsAt)}
        </p>
        <PassQrCode code={pass.code} />
        <p className="text-sm font-medium text-muted-foreground" id="pass-code-label">
          Pass code
        </p>
        <p
          className="font-mono text-4xl leading-none font-semibold tracking-wider"
          aria-labelledby="pass-code-label"
        >
          {formatPassCode(pass.code)}
        </p>
      </section>

      {/* A finished pass's code no longer lets anyone in, so there is nothing to share or cancel. */}
      {live && (
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button className="sm:flex-1" onClick={() => void share(pass)}>
            <Share2 aria-hidden="true" />
            Share
          </Button>
          {!confirming && (
            <Button
              variant="outline"
              className="border-destructive text-destructive sm:flex-1"
              onClick={() => setConfirming(true)}
            >
              Cancel pass
            </Button>
          )}
        </div>
      )}

      <div aria-live="polite">
        {shared === 'copied' && (
          <p className="text-sm text-muted-foreground">
            Copied the pass. Paste it into a message to your guest.
          </p>
        )}
        {shared === 'failed' && (
          <p className="text-sm text-destructive">
            Could not share the pass. Read the code out to your guest instead.
          </p>
        )}
      </div>

      {confirming && (
        <section
          aria-labelledby="cancel-heading"
          className="flex flex-col gap-3 rounded-xl border border-destructive p-4"
        >
          <h2 id="cancel-heading" className="font-semibold">
            Cancel this pass?
          </h2>
          <p className="text-sm text-muted-foreground">
            The code stops working for new entries straight away.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              variant="destructive"
              className="grow"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {busy ? 'Cancelling…' : 'Yes, cancel the pass'}
            </Button>
            <Button
              variant="outline"
              className="grow"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep the pass
            </Button>
          </div>
        </section>
      )}

      <div aria-live="polite">{errorAlert}</div>

      <section className="flex flex-col gap-1 rounded-xl border bg-card p-4">
        <p className="font-semibold">
          {pass.guestsUsed === 0
            ? 'No guests have come in yet'
            : `${pass.guestsUsed} of ${pass.guestCount} guests came in`}
        </p>
        {live && remaining > 0 && (
          <p className="text-sm text-muted-foreground">
            {remaining} more can still come in until {formatPassMoment(pass.endsAt)}
          </p>
        )}
      </section>

      {live && (
        <p className="text-sm text-muted-foreground">
          Cancelling stops new entries straight away. Guests already inside can still be checked
          out.
        </p>
      )}
    </div>
  );
}
