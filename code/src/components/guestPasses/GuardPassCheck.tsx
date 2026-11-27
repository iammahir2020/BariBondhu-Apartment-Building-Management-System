'use client';

/**
 * Guard-side guest pass checking and check-in UI.
 * BB-1706, BB-1707, SG-02, SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import { useState, type FormEvent } from 'react';
import { callApi, type ApiResult } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GuestPassCheckResponse {
  passId: string;
  guestName: string;
  flat: string;
  approvedGuestCount: number;
  remainingGuestCount: number;
  status: string;
  checkInAllowed: boolean;
  reason: 'Expired' | 'Cancelled' | 'Valid from' | 'Fully used' | null;
  validFrom: string | null;
}

interface GuestPassEntryResponse {
  visit: {
    id: string;
  };
  remainingGuestCount: number;
}

const OFFLINE_MESSAGE = 'No connection: use the intercom and paper register';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Prevents the guard screen from waiting longer than five seconds.
 * A timed-out request is not presented as a successful operation.
 */
async function callApiWithTimeout<T>(
  url: string,
  method: string,
  body: unknown,
): Promise<ApiResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<ApiResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        status: 0,
        error: {
          code: 'INTERNAL',
          message: OFFLINE_MESSAGE,
        },
      });
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([callApi<T>(url, method, body), timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function formatValidFrom(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

/**
 * Allows a guard to check a six-digit guest pass code
 * and record guest arrivals against a valid pass.
 */
export function GuardPassCheck() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<GuestPassCheckResponse | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guestsIn, setGuestsIn] = useState('1');
  const [enteredLater, setEnteredLater] = useState(false);
  const [actualArrival, setActualArrival] = useState('');

  function displayApiError(response: Extract<ApiResult<unknown>, { ok: false }>) {
    setError(response.status === 0 ? OFFLINE_MESSAGE : response.error.message);
  }

  async function handleCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setError('Enter a valid six-digit pass code.');
      return;
    }

    setCheckLoading(true);
    setError('');
    setSuccess('');
    setResult(null);
    setGuestsIn('1');
    setEnteredLater(false);
    setActualArrival('');

    const response = await callApiWithTimeout<GuestPassCheckResponse>(
      '/api/guard/guest-passes/check',
      'POST',
      { code },
    );

    if (!response.ok) {
      displayApiError(response);
      setCheckLoading(false);
      return;
    }

    setResult(response.data);
    setCheckLoading(false);
  }

  async function handleEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!result || !result.checkInAllowed) return;

    const count = Number(guestsIn);

    if (!Number.isInteger(count) || count <= 0 || count > result.remainingGuestCount) {
      setError('Enter a valid number within the remaining guest allowance.');
      return;
    }

    let enteredAt: string | undefined;

    if (enteredLater) {
      if (!actualArrival) {
        setError('Enter the actual arrival date and time.');
        return;
      }

      const actualArrivalDate = new Date(actualArrival);

      if (Number.isNaN(actualArrivalDate.getTime())) {
        setError('Enter a valid actual arrival date and time.');
        return;
      }

      enteredAt = actualArrivalDate.toISOString();
    }

    setEntryLoading(true);
    setError('');
    setSuccess('');

    const response = await callApiWithTimeout<GuestPassEntryResponse>(
      '/api/guard/guest-passes/entry',
      'POST',
      {
        passId: result.passId,
        guestsIn: count,
        ...(enteredLater && enteredAt ? { enteredLater: true, enteredAt } : {}),
      },
    );

    if (!response.ok) {
      displayApiError(response);
      setEntryLoading(false);
      return;
    }

    const remaining = response.data.remainingGuestCount;

    setResult((previous) =>
      previous
        ? {
            ...previous,
            remainingGuestCount: remaining,
            status: remaining === 0 ? 'Fully used' : 'Partly used',
            checkInAllowed: remaining > 0,
            reason: remaining === 0 ? 'Fully used' : null,
          }
        : previous,
    );

    setSuccess(
      enteredLater
        ? `${count} ${count === 1 ? 'guest has' : 'guests have'} been recorded as Entered later.`
        : `${count} ${count === 1 ? 'guest has' : 'guests have'} been checked in successfully.`,
    );

    setGuestsIn('1');
    setEnteredLater(false);
    setActualArrival('');
    setEntryLoading(false);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Check a guest pass</h1>
        <p className="text-sm text-muted-foreground">
          Enter the six-digit code provided by the guest to check pass validity and record their
          arrival.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <form onSubmit={handleCheck} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="pass-code" className="text-sm font-semibold">
              Guest pass code
            </label>

            <Input
              id="pass-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="off"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={checkLoading}
              required
              aria-describedby="pass-code-help"
            />

            <p id="pass-code-help" className="text-xs text-muted-foreground">
              The code must contain exactly six digits.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={checkLoading || code.length !== 6}>
            {checkLoading ? 'Checking pass...' : 'Check pass'}
          </Button>
        </form>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          {success}
        </div>
      )}

      {result && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Pass details</h2>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                result.checkInAllowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {result.status}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Guest name</p>
              <p className="font-semibold">{result.guestName}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Flat</p>
              <p className="font-semibold">{result.flat}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Approved guests</p>
              <p className="font-semibold">{result.approvedGuestCount}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Remaining guests</p>
              <p className="font-semibold">{result.remainingGuestCount}</p>
            </div>
          </div>

          {!result.checkInAllowed && (
            <div
              role="status"
              className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
            >
              <p className="font-semibold">Pass not valid</p>

              {result.reason === 'Valid from' && result.validFrom ? (
                <p>Valid from: {formatValidFrom(result.validFrom)}</p>
              ) : (
                <p>Reason: {result.reason ?? result.status}</p>
              )}
            </div>
          )}

          {result.checkInAllowed && (
            <form onSubmit={handleEntry} className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <label htmlFor="guests-in" className="text-sm font-semibold">
                  Number of guests arriving
                </label>

                <Input
                  id="guests-in"
                  type="number"
                  min={1}
                  max={result.remainingGuestCount}
                  step={1}
                  value={guestsIn}
                  onChange={(event) => setGuestsIn(event.target.value)}
                  disabled={entryLoading}
                  required
                />

                <p className="text-xs text-muted-foreground">
                  Maximum allowed: {result.remainingGuestCount} guest(s).
                </p>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <label
                  htmlFor="entered-later"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <input
                    id="entered-later"
                    type="checkbox"
                    checked={enteredLater}
                    onChange={(event) => setEnteredLater(event.target.checked)}
                    disabled={entryLoading}
                  />
                  Entered later (paper register)
                </label>

                {enteredLater && (
                  <div className="space-y-2">
                    <label htmlFor="actual-arrival" className="text-sm font-semibold">
                      Actual arrival date and time
                    </label>

                    <Input
                      id="actual-arrival"
                      type="datetime-local"
                      value={actualArrival}
                      onChange={(event) => setActualArrival(event.target.value)}
                      disabled={entryLoading}
                      required
                    />

                    <p className="text-xs text-muted-foreground">
                      Enter the time recorded in the paper register, not the time you are submitting
                      this form.
                    </p>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  entryLoading ||
                  !Number.isInteger(Number(guestsIn)) ||
                  Number(guestsIn) < 1 ||
                  Number(guestsIn) > result.remainingGuestCount ||
                  (enteredLater && !actualArrival)
                }
              >
                {entryLoading ? 'Recording entry...' : 'Confirm guest entry'}
              </Button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
