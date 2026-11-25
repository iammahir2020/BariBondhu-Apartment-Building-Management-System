/**
 * The New guest pass form (prototype `R-GuestPass-New.html`, RES-03): the guest's name, how many people (1 to 20,
 * with a stepper), and when, as a quick choice or picked From and Until times. "Create pass" sends it to the API
 * and opens the new pass's code. Every rule and its wording come from the API; the form only sends what was chosen
 * and shows the answer.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Minus, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';
import type { GuestPassView } from '@/lib/guestPassResponse';
import {
  PASS_WINDOW_LABELS,
  fromLocalInput,
  presetWindow,
  type PassWindowChoice,
} from '@/components/guestPasses/passTimes';

/**
 * The stepper's range (RES-03). The API checks the same range with "Enter 1 to 20 guests"; the service's constants
 * can't be imported here, because the service runs on the server only.
 */
const MIN_GUESTS = 1;
const MAX_GUESTS = 20;

/**
 * Where a new pass opens: its code, to show or share (R-GuestPass-Code).
 * @param passId - The pass.
 * @returns The page's path.
 */
export function passCodePath(passId: string): string {
  return `/resident/guest-passes/${passId}`;
}

/** Props for {@link NewGuestPassForm}. */
export interface NewGuestPassFormProps {
  /** The current time, for the quick choices; tests pass a fixed one. */
  now?: () => Date;
}

/**
 * New guest pass.
 * @param props - Optionally, the clock.
 * @returns The form.
 */
export function NewGuestPassForm({ now = () => new Date() }: NewGuestPassFormProps) {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [choice, setChoice] = useState<PassWindowChoice>('next6');
  const [times, setTimes] = useState(() => presetWindow('next6', now()));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /** A quick choice fills both boxes; "Pick times" leaves them for the resident to change. */
  function choose(next: PassWindowChoice): void {
    setChoice(next);
    if (next !== 'pick') setTimes(presetWindow(next, now()));
  }

  /** Typing a time is picking times. */
  function changeTime(box: 'from' | 'until', value: string): void {
    setChoice('pick');
    setTimes((current) => ({ ...current, [box]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    setError(null);
    const result = await callApi<{ pass: GuestPassView }>('/api/guest-passes', 'POST', {
      guestName,
      guestCount,
      startsAt: fromLocalInput(times.from),
      endsAt: fromLocalInput(times.until),
    });
    if (result.ok) {
      router.push(passCodePath(result.data.pass.id));
      return;
    }
    setSending(false);
    setError(result.error.message);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">New guest pass</h1>
      <p className="text-[15px] text-muted-foreground">
        The guard checks the code at the gate, so your guests don&apos;t wait for the intercom.
      </p>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="guest-name">Guest name</Label>
          <Input
            id="guest-name"
            autoComplete="off"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-semibold">How many people</legend>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="One fewer"
              disabled={guestCount <= MIN_GUESTS}
              onClick={() => setGuestCount((n) => Math.max(MIN_GUESTS, n - 1))}
            >
              <Minus aria-hidden="true" />
            </Button>
            <span className="min-w-8 text-center text-xl font-semibold" aria-live="polite">
              {guestCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="One more"
              disabled={guestCount >= MAX_GUESTS}
              onClick={() => setGuestCount((n) => Math.min(MAX_GUESTS, n + 1))}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {MIN_GUESTS} to {MAX_GUESTS} people
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-semibold">When</legend>
          <div className="flex flex-wrap gap-2">
            {(['next6', 'evening', 'pick'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={choice === value ? 'default' : 'outline'}
                className="rounded-full"
                aria-pressed={choice === value}
                onClick={() => choose(value)}
              >
                {PASS_WINDOW_LABELS[value]}
              </Button>
            ))}
          </div>
        </fieldset>

        {/* A date-time box has a minimum width of its own: min-w-0 lets it shrink so the page doesn't scroll sideways
            at 360 px, and the smaller padding keeps the whole time readable at 150% text (NFR-23). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="pass-from">From</Label>
            <Input
              id="pass-from"
              type="datetime-local"
              className="min-w-0 px-2"
              value={times.from}
              onChange={(event) => changeTime('from', event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="pass-until">Until</Label>
            <Input
              id="pass-until"
              type="datetime-local"
              className="min-w-0 px-2"
              value={times.until}
              onChange={(event) => changeTime('until', event.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A pass lasts at most 24 hours and can run past midnight.
        </p>

        <div aria-live="polite">
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={sending}>
          {sending ? 'Creating…' : 'Create pass'}
        </Button>
      </form>
    </div>
  );
}
