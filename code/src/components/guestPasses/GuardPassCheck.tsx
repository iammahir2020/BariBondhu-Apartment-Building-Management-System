'use client';

/**
 * Guard-side guest pass checking and check-in UI.
 * BB-1706, SG-02, SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import { useState, type FormEvent } from 'react';
import { callApi } from '@/lib/apiClient';
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

    const response = await callApi<GuestPassCheckResponse>(
      '/api/guard/guest-passes/check',
      'POST',
      { code },
    );

    if (!response.ok) {
      setError(response.error.message);
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

    setEntryLoading(true);
    setError('');
    setSuccess('');

    const response = await callApi<GuestPassEntryResponse>(
      '/api/guard/guest-passes/entry',
      'POST',
      {
        passId: result.passId,
        guestsIn: count,
      },
    );

    if (!response.ok) {
      setError(response.error.message);
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
      `${count} ${count === 1 ? 'guest has' : 'guests have'} been checked in successfully.`,
    );
    setGuestsIn('1');
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

              <Button
                type="submit"
                className="w-full"
                disabled={
                  entryLoading ||
                  !Number.isInteger(Number(guestsIn)) ||
                  Number(guestsIn) < 1 ||
                  Number(guestsIn) > result.remainingGuestCount
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
