'use client';

/**
 * The Emergency screen for every role (`/emergency`, prototype `S-Emergency.html` and `S-Emergency-Web.html`,
 * SG-06, BR-12, BB-2006). 999 is always first and needs nothing from the server, so it works signed out and offline.
 * Then come the guard-desk and manager numbers from `/api/emergency-contacts`. The last numbers loaded are kept on
 * the device, so they still show, and can be called, when the connection is lost or the session has ended.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Phone, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatBillMoment } from '@/components/payments/billView';
import { callApi } from '@/lib/apiClient';
import {
  NATIONAL_EMERGENCY_NUMBER,
  type EmergencyNumber,
} from '@/services/emergencyContactService';
import {
  formatPhone,
  loadNumbers,
  saveNumbers,
  telHref,
  type SavedNumbers,
} from './emergencyNumbers';

/** What the screen knows about the building numbers. */
type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; numbers: EmergencyNumber[] }
  | {
      state: 'unavailable';
      /** Why the server couldn't give them. */
      reason: 'offline' | 'signedOut' | 'error';
      message: string;
      /** The copy kept on this device, if any. */
      saved: SavedNumbers | null;
    };

/** One number with its Call button. */
function NumberRow({
  label,
  detail,
  phone,
  urgent = false,
}: {
  label: string;
  detail?: string;
  phone: string;
  urgent?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
      <div className="min-w-40 flex-1">
        <p className={urgent ? 'text-[2rem] leading-none font-bold' : 'text-base font-semibold'}>
          {urgent ? phone : label}
        </p>
        <p className="text-base text-muted-foreground">{urgent ? detail : formatPhone(phone)}</p>
      </div>
      <Button
        asChild
        variant={urgent ? 'destructive' : 'default'}
        className="min-h-12 min-w-28 rounded-full text-base"
      >
        <a href={telHref(phone)} aria-label={`Call ${urgent ? phone : label}`}>
          <Phone aria-hidden="true" />
          Call
        </a>
      </Button>
    </li>
  );
}

/**
 * The Emergency screen.
 * @returns The numbers to call.
 */
export function EmergencyView() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    void callApi<{ numbers: EmergencyNumber[] }>('/api/emergency-contacts', 'GET').then(
      (answer) => {
        if (answer.ok) {
          saveNumbers(window.localStorage, answer.data.numbers, new Date());
          setLoaded({ state: 'ready', numbers: answer.data.numbers });
          return;
        }
        const saved = loadNumbers(window.localStorage);
        if (answer.status === 0) {
          setLoaded({ state: 'unavailable', reason: 'offline', message: '', saved });
        } else if (answer.status === 401) {
          setLoaded({ state: 'unavailable', reason: 'signedOut', message: '', saved });
        } else {
          setLoaded({
            state: 'unavailable',
            reason: 'error',
            message: answer.error.message,
            saved,
          });
        }
      },
    );
  }, []);

  const shown =
    loaded.state === 'ready'
      ? loaded.numbers
      : loaded.state === 'unavailable'
        ? (loaded.saved?.numbers ?? [])
        : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[1.625rem] font-bold">Emergency numbers</h1>
        <p className="text-base">
          Fire, gas smell, someone stuck in a lift: call first. You can log a repair after.
        </p>
      </div>

      <Card className="gap-0 px-4 py-1">
        <ul className="divide-y divide-border">
          <NumberRow
            label="National emergency"
            detail="National emergency: fire, police, ambulance"
            phone={NATIONAL_EMERGENCY_NUMBER}
            urgent
          />
          {shown.map((number) => (
            <NumberRow key={`${number.label}-${number.phone}`} {...number} />
          ))}
        </ul>
        {loaded.state === 'loading' && (
          <p className="pb-3.5 text-base text-muted-foreground">Loading the building numbers…</p>
        )}
        {loaded.state === 'ready' && loaded.numbers.length === 0 && (
          <p className="pb-3.5 text-base text-muted-foreground">
            The manager hasn&apos;t added the building numbers yet.
          </p>
        )}
      </Card>

      {loaded.state === 'unavailable' && <Unavailable loaded={loaded} />}

      <p className="text-sm text-muted-foreground">
        999 is always first and cannot be changed. The manager keeps the building numbers up to
        date. These numbers still show when you are offline.
      </p>
    </div>
  );
}

/** Why the building numbers aren't fresh, and what is shown instead. */
function Unavailable({ loaded }: { loaded: Extract<Loaded, { state: 'unavailable' }> }) {
  const savedLine = loaded.saved
    ? `Showing the numbers last loaded on this device, ${formatBillMoment(loaded.saved.savedAt)}.`
    : null;

  if (loaded.reason === 'offline') {
    return (
      <Alert variant="warn">
        <WifiOff aria-hidden="true" />
        <AlertDescription className="text-base">
          You&apos;re offline. {savedLine ?? 'No building numbers are saved on this device yet.'}{' '}
          999 still works.
        </AlertDescription>
      </Alert>
    );
  }
  if (loaded.reason === 'signedOut') {
    return (
      <Alert>
        <CircleAlert aria-hidden="true" />
        <AlertDescription className="text-base">
          {savedLine ? `${savedLine} ` : ''}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
            Log in
          </Link>{' '}
          to see the latest guard desk and manager numbers.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="text-base">
        {loaded.message} {savedLine ?? ''}
      </AlertDescription>
    </Alert>
  );
}
