/**
 * The emergency path of Report a fault (RES-02, BR-12, prototype `S-Emergency.html`): for a fire, gas smell or
 * someone stuck in a lift, call first. 999 is always first and can't be changed, so it is part of the screen, not
 * data; the guard desk and manager numbers are on the Emergency screen. After calling, "Log it for repair" turns the
 * report into an Urgent one.
 *
 * @author Mahir Al Kamal
 */
'use client';

import Link from 'next/link';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** The two emergencies a resident can log from here. */
export type EmergencyKind = 'fire' | 'lift';

/** What each emergency is called on screen. */
export const EMERGENCY_LABELS: Readonly<Record<EmergencyKind, string>> = {
  fire: 'Fire or gas smell',
  lift: 'Someone stuck in a lift',
};

/** Props for {@link EmergencyFirst}. */
export interface EmergencyFirstProps {
  kind: EmergencyKind;
  /** "Log it for repair": go on to the report, as Urgent. */
  onLog: () => void;
  /** Back to the normal report. */
  onClose: () => void;
}

/**
 * Call 999 first, then log the repair.
 * @param props - Which emergency, and what the two buttons do.
 * @returns The panel.
 */
export function EmergencyFirst({ kind, onLog, onClose }: EmergencyFirstProps) {
  return (
    <section
      aria-labelledby="emergency-heading"
      className="flex flex-col gap-3.5 rounded-xl border-2 border-destructive p-4"
    >
      <h2 id="emergency-heading" className="text-lg font-bold text-destructive">
        {EMERGENCY_LABELS[kind]}: call first
      </h2>
      <p>Fire, gas smell, someone stuck in a lift: call first. You can log a repair after.</p>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-3xl leading-none font-bold">999</p>
          <p className="text-sm text-muted-foreground">
            National emergency: fire, police, ambulance
          </p>
        </div>
        <Button asChild variant="destructive" size="sm">
          <a href="tel:999" aria-label="Call 999">
            <Phone aria-hidden="true" />
            Call
          </a>
        </Button>
      </div>
      <Link
        href="/emergency"
        prefetch={false}
        className="inline-flex min-h-12 items-center font-semibold text-primary underline-offset-4 hover:underline"
      >
        Guard desk and manager numbers
      </Link>
      <Card className="gap-1.5 p-4">
        <h3 className="font-semibold">After you have called</h3>
        <p className="text-sm text-muted-foreground">
          Log it so the manager sends someone. It is saved as Urgent.
        </p>
        <Button variant="secondary" className="mt-1.5 w-full" onClick={onLog}>
          Log it for repair
        </Button>
      </Card>
      <Button variant="ghost" className="self-start" onClick={onClose}>
        It isn&apos;t an emergency
      </Button>
    </section>
  );
}
