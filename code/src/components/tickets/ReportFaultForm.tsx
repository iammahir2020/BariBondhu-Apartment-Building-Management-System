/**
 * The Report a fault form (prototype `R-ReportFault.html`, RES-02). A fault is inside my flat or in a common area,
 * with a kind, a short title, a description, an optional photo and, for my flat, when someone is home. For a common
 * area, as soon as the place and kind are picked it asks whether a neighbour already reported it, and offers "Me too"
 * instead of a second ticket (BR-13).
 *
 * The emergency chips show 999 first ({@link EmergencyFirst}); "Log it for repair" then sends the report as an
 * emergency, which the service saves as Urgent. Every rule and its wording come from the API; the form only sends
 * what was typed and shows the answer.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Siren } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';
import type { TicketCategory } from '@/models/Ticket';
import type { MatchRelation } from '@/services/ticketService';
import {
  EMERGENCY_LABELS,
  EmergencyFirst,
  type EmergencyKind,
} from '@/components/tickets/EmergencyFirst';
import { STATUS_BADGE, type TicketView } from '@/components/tickets/ticketView';

/** What the form offers, from `/api/common-area-places`. */
interface FormOptions {
  places: { id: string; name: string }[];
  categories: TicketCategory[];
}

/** The category each emergency is logged under. */
const EMERGENCY_CATEGORY: Readonly<Record<EmergencyKind, TicketCategory>> = {
  fire: 'Fire or gas smell',
  lift: 'Lift',
};

/** Where to go once the report is in. */
const MY_TICKETS = '/resident/tickets';

/** An open ticket that matches the report, and how my household stands with it, as the routes send them. */
interface Match {
  ticket: TicketView;
  relation: MatchRelation;
}

/** The match card's heading for each relation, so my own report isn't called a neighbour's. */
const MATCH_HEADINGS: Readonly<Record<MatchRelation, string>> = {
  neighbour: 'Already reported by a neighbour',
  reported: 'Your household already reported this',
  following: 'You already follow this ticket',
};

/**
 * Reads a match from a route's answer.
 * @param ticket - The ticket the route sent, if any.
 * @param relation - How my household stands with it; a missing one counts as a neighbour's.
 * @returns The match, or null when there is no ticket.
 */
function toMatch(
  ticket: TicketView | null | undefined,
  relation: MatchRelation | null | undefined,
): Match | null {
  return ticket ? { ticket, relation: relation ?? 'neighbour' } : null;
}

/** Shared look of the description box, matching {@link Input}. */
const TEXTAREA =
  'min-h-28 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Props for {@link ReportFaultForm}. */
export interface ReportFaultFormProps {
  /** Start in the emergency report, as after "Log it for repair" on the Emergency screen. */
  emergency?: EmergencyKind | null;
}

/**
 * Report a fault.
 * @param props - Whether to start as an emergency report.
 * @returns The form.
 */
export function ReportFaultForm({ emergency: startAs = null }: ReportFaultFormProps) {
  const router = useRouter();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [asking, setAsking] = useState<EmergencyKind | null>(null);
  const [emergency, setEmergency] = useState<EmergencyKind | null>(startAs);
  const [where, setWhere] = useState<'flat' | 'common'>(startAs === 'lift' ? 'common' : 'flat');
  const [category, setCategory] = useState<TicketCategory | null>(
    startAs ? EMERGENCY_CATEGORY[startAs] : null,
  );
  const [placeId, setPlaceId] = useState('');
  const [title, setTitle] = useState(startAs ? EMERGENCY_LABELS[startAs] : '');
  const [description, setDescription] = useState('');
  const [homeTimes, setHomeTimes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void callApi<FormOptions>('/api/common-area-places', 'GET').then((result) => {
      if (result.ok) setOptions(result.data);
      else setError(result.error.message);
    });
  }, []);

  useEffect(() => {
    if (where !== 'common' || placeId === '' || category === null) {
      setMatch(null);
      return;
    }
    let current = true;
    const query = new URLSearchParams({ placeId, category });
    void callApi<{ match: TicketView | null; relation?: MatchRelation | null }>(
      `/api/tickets/match?${query}`,
      'GET',
    ).then((result) => {
      if (current && result.ok) setMatch(toMatch(result.data.match, result.data.relation));
    });
    return () => {
      current = false;
    };
  }, [where, placeId, category]);

  /** "Log it for repair": the report becomes an emergency, with its category and a title to start from. */
  function logEmergency(kind: EmergencyKind): void {
    setAsking(null);
    setEmergency(kind);
    setCategory(EMERGENCY_CATEGORY[kind]);
    if (title.trim() === '') setTitle(EMERGENCY_LABELS[kind]);
    if (kind === 'lift') setWhere('common');
  }

  /** Back to a normal report; the emergency category is dropped, since only the emergency path may use it. */
  function leaveEmergency(): void {
    setEmergency(null);
    setCategory(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set('where', where);
    if (where === 'common') form.set('placeId', placeId);
    form.set('category', category ?? '');
    form.set('title', title);
    form.set('description', description);
    if (where === 'flat') form.set('homeTimes', homeTimes);
    if (photo) form.set('photo', photo);
    if (emergency) form.set('emergency', 'true');

    const result = await callApi<{
      ticket?: TicketView;
      match?: TicketView;
      relation?: MatchRelation;
    }>('/api/tickets', 'POST', form);
    setSending(false);
    if (!result.ok) {
      setError(result.error.message);
    } else if (result.data.match) {
      setMatch(toMatch(result.data.match, result.data.relation));
    } else {
      router.push(MY_TICKETS);
    }
  }

  async function meToo(ticketId: string): Promise<void> {
    setSending(true);
    setError(null);
    const result = await callApi(`/api/tickets/${ticketId}/followers`, 'POST');
    setSending(false);
    if (result.ok) router.push(MY_TICKETS);
    else setError(result.error.message);
  }

  const kinds = (options?.categories ?? []).filter((c) => c !== 'Fire or gas smell');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Report a fault</h1>

      {emergency === null && (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="pb-2 font-semibold">Is it an emergency?</legend>
          <div className="flex flex-wrap gap-2">
            {(['fire', 'lift'] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                className="h-auto min-h-13 max-w-full rounded-full border-destructive py-2 whitespace-normal text-destructive"
                aria-pressed={asking === kind}
                onClick={() => setAsking(kind)}
              >
                {EMERGENCY_LABELS[kind]}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            These show 999 and the building numbers first.
          </p>
        </fieldset>
      )}

      {asking !== null && (
        <EmergencyFirst
          kind={asking}
          onLog={() => logEmergency(asking)}
          onClose={() => setAsking(null)}
        />
      )}

      {emergency !== null && (
        <Alert variant="urgent">
          <Siren aria-hidden="true" />
          <AlertTitle>Emergency: {EMERGENCY_LABELS[emergency]}</AlertTitle>
          <AlertDescription>
            <p>This report is saved as Urgent, so the manager sends someone first.</p>
            <Button variant="link" className="h-auto min-h-12 px-0" onClick={leaveEmergency}>
              It isn&apos;t an emergency
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-semibold">Where is the problem?</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ['flat', 'Inside my flat'],
                ['common', 'Common area'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={where === value ? 'default' : 'ghost'}
                aria-pressed={where === value}
                onClick={() => setWhere(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>

        {emergency === null && (
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 font-semibold">What kind?</legend>
            <div className="flex flex-wrap gap-2">
              {kinds.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant={category === kind ? 'default' : 'outline'}
                  className="rounded-full"
                  aria-pressed={category === kind}
                  onClick={() => setCategory(kind)}
                >
                  {kind}
                </Button>
              ))}
            </div>
          </fieldset>
        )}

        {where === 'common' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="place">Place</Label>
            <select
              id="place"
              className="h-13 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 text-base"
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
            >
              <option value="">Choose a place</option>
              {(options?.places ?? []).map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {match ? (
          <section
            aria-labelledby="match-heading"
            className="flex flex-col gap-2.5 rounded-xl border border-primary bg-secondary p-4"
          >
            <h2 id="match-heading" className="text-sm font-semibold text-brand-900">
              {MATCH_HEADINGS[match.relation]}
            </h2>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{match.ticket.title ?? 'Fault'}</p>
                <p className="text-sm text-muted-foreground">{match.ticket.category}</p>
              </div>
              <Badge variant={STATUS_BADGE[match.ticket.status]} className="shrink-0">
                {match.ticket.status}
              </Badge>
            </div>
            {match.relation === 'neighbour' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={sending}
                  onClick={() => void meToo(match.ticket.id)}
                >
                  Me too: follow this ticket
                </Button>
                <p className="text-sm text-muted-foreground">
                  You&apos;ll get the same updates. No new ticket is made.
                </p>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(MY_TICKETS)}
                >
                  See my tickets
                </Button>
                <p className="text-sm text-muted-foreground">
                  You already get its updates. No new ticket is made.
                </p>
              </>
            )}
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Short title</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Describe the problem</Label>
              <textarea
                id="description"
                className={TEXTAREA}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="photo">Add a photo (optional)</Label>
              <Input
                id="photo"
                type="file"
                accept="image/jpeg,image/png"
                className="py-3"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
              <p className="text-sm text-muted-foreground">
                The repair person sees your flat number, photo and home times, never your phone
                number.
              </p>
            </div>
            {where === 'flat' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="home-times">When is someone home?</Label>
                <Input
                  id="home-times"
                  placeholder="Weekdays after 5 pm, Fri all day"
                  value={homeTimes}
                  onChange={(event) => setHomeTimes(event.target.value)}
                />
              </div>
            )}
          </>
        )}

        <div aria-live="polite">
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {!match && (
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        )}
      </form>
    </div>
  );
}
