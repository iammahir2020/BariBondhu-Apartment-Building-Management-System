/**
 * The resident's My tickets list (prototype `R-Tickets.html`, RES-02): every ticket my household reported or follows
 * with "Me too", newest first. The newest open ticket shows its progress; the rest show their status. A Reported
 * ticket can be cancelled, or unfollowed when other households follow it; the service decides which (TC-R02-17 to
 * TC-R02-19).
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import type { TicketStatus } from '@/models/Ticket';
import { isFinalTicketStatus } from '@/services/ticketStateMachine';
import {
  STATUS_BADGE,
  formatDay,
  formatMoment,
  type MyTicketView,
} from '@/components/tickets/ticketView';

/** What the cancel route says happened. */
interface CancelResponse {
  outcome: 'cancelled' | 'unfollowed';
}

/** A message above the list. */
type Notice = { kind: 'ok' | 'error'; message: string };

/** The progress steps a resident sees, in order. */
const STEPS = ['Reported', 'Assigned', 'In progress', 'Fixed'] as const;

/** Where a status sits on {@link STEPS}. On hold counts as In progress, so it keeps its place. */
function stepIndex(status: TicketStatus): number {
  if (status === 'On hold') return 2;
  const index = STEPS.findIndex((step) => step === status);
  return index === -1 ? 0 : index;
}

/** Where the fault is and what kind: "Inside my flat · Plumbing" or "Water pump · Plumbing". */
function whereAndKind(row: MyTicketView): string {
  return `${row.placeName ?? 'Inside my flat'} · ${row.ticket.category}`;
}

/** The line under a row's title: who follows it, or when it finished. */
function followLine(row: MyTicketView): string {
  const { ticket, followerCount, reportedByMe } = row;
  if (isFinalTicketStatus(ticket.status)) {
    return `${ticket.status} ${formatDay(ticket.updatedAt)}`;
  }
  if (!reportedByMe) return `${whereAndKind(row)} · you follow this (Me too)`;
  const others = followerCount - 1;
  let who = 'nobody else follows it';
  if (others === 1) who = '1 other household follows it';
  else if (others > 1) who = `${others} other households follow it`;
  return `Reported ${formatDay(ticket.createdAt)} · ${who}`;
}

/** The text on a Reported ticket's button: Cancel when only my household is on it, else Stop following. */
function cancelLabel(row: MyTicketView): string {
  return row.reportedByMe && row.followerCount <= 1 ? 'Cancel' : 'Stop following';
}

/**
 * My tickets, with Report a fault on top.
 * @returns The list.
 */
export function MyTicketsList() {
  const [rows, setRows] = useState<MyTicketView[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<{ tickets: MyTicketView[] }>('/api/tickets', 'GET');
    if (result.ok) setRows(result.data.tickets);
    else setNotice({ kind: 'error', message: result.error.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(ticketId: string): Promise<void> {
    setBusy(true);
    const result = await callApi<CancelResponse>(`/api/tickets/${ticketId}/cancel`, 'POST');
    setConfirming(null);
    setBusy(false);
    if (!result.ok) {
      setNotice({ kind: 'error', message: result.error.message });
    } else if (result.data.outcome === 'cancelled') {
      setNotice({ kind: 'ok', message: 'Ticket cancelled.' });
    } else {
      setNotice({ kind: 'ok', message: 'You no longer follow this ticket.' });
    }
    await load();
  }

  const progress = rows?.find((row) => !isFinalTicketStatus(row.ticket.status));
  const rest = rows?.filter((row) => row !== progress) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5">
      <h1 className="text-xl font-bold">Repairs</h1>
      <Button asChild className="w-full">
        <Link href="/resident/report-fault">
          <Plus aria-hidden="true" />
          Report a fault
        </Link>
      </Button>

      <div aria-live="polite">
        {notice && (
          <Alert variant={notice.kind === 'ok' ? 'ok' : 'destructive'}>
            {notice.kind === 'ok' ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        )}
      </div>

      {rows === null && !notice && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tickets yet. Report a fault when something needs fixing.
        </p>
      )}

      {progress && (
        <Card
          role="region"
          className="gap-3 p-4"
          aria-label={`Progress of ${progress.ticket.title ?? 'ticket'}`}
        >
          <TicketHeading row={progress} detail={whereAndKind(progress)} />
          <Progress row={progress} />
          <CancelControl
            row={progress}
            confirming={confirming === progress.ticket.id}
            busy={busy}
            onAsk={() => setConfirming(progress.ticket.id)}
            onBack={() => setConfirming(null)}
            onConfirm={() => void cancel(progress.ticket.id)}
          />
        </Card>
      )}

      {rest.length > 0 && (
        <Card className="gap-0 p-0">
          <ul aria-label="Other tickets" className="divide-y divide-border">
            {rest.map((row) => (
              <li key={row.ticket.id} className="flex flex-col gap-2 px-4 py-3.5">
                <TicketHeading row={row} detail={followLine(row)} />
                <CancelControl
                  row={row}
                  confirming={confirming === row.ticket.id}
                  busy={busy}
                  onAsk={() => setConfirming(row.ticket.id)}
                  onBack={() => setConfirming(null)}
                  onConfirm={() => void cancel(row.ticket.id)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** A ticket's title, the line under it and its status badge. */
function TicketHeading({ row, detail }: { row: MyTicketView; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold wrap-break-word">{row.ticket.title ?? 'Fault'}</h2>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={STATUS_BADGE[row.ticket.status]} className="shrink-0">
        {row.ticket.status}
      </Badge>
    </div>
  );
}

/** The steps from Reported to Fixed, done ones filled in. */
function Progress({ row }: { row: MyTicketView }) {
  const { ticket } = row;
  const reached = stepIndex(ticket.status);
  const labels: Record<(typeof STEPS)[number], string> = {
    Reported: 'Reported',
    Assigned: ticket.dueDate ? `Assigned · due ${formatDay(ticket.dueDate)}` : 'Assigned',
    'In progress': ticket.status === 'On hold' ? 'On hold' : 'In progress',
    Fixed: 'Fixed, then closed by the manager',
  };
  return (
    <ol className="flex flex-col">
      {STEPS.map((step, i) => {
        const done = i <= reached;
        return (
          <li key={step} className="flex gap-3" aria-current={i === reached ? 'step' : undefined}>
            <span className="flex flex-col items-center" aria-hidden="true">
              <span
                className={
                  done
                    ? 'mt-1 size-3 rounded-full bg-primary'
                    : 'mt-1 size-3 rounded-full border-2 border-border bg-card'
                }
              />
              {i < STEPS.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
            </span>
            <span className="pb-3">
              <span
                className={
                  done ? 'block font-semibold' : 'block font-semibold text-muted-foreground'
                }
              >
                {labels[step]}
                <span className="sr-only">{done ? ' (done)' : ' (to come)'}</span>
              </span>
              {i === 0 && (
                <span className="block text-sm text-muted-foreground">
                  {formatMoment(ticket.createdAt)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Props for {@link CancelControl}. */
interface CancelControlProps {
  row: MyTicketView;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onBack: () => void;
  onConfirm: () => void;
}

/** Cancel or Stop following for a Reported ticket, asking once before it goes. Nothing for other statuses. */
function CancelControl({ row, confirming, busy, onAsk, onBack, onConfirm }: CancelControlProps) {
  if (row.ticket.status !== 'Reported') return null;
  const label = cancelLabel(row);
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" className="self-end" onClick={onAsk}>
        {label}
      </Button>
    );
  }
  const question =
    label === 'Cancel'
      ? 'Cancel this ticket?'
      : 'Stop following? The ticket stays open for others.';
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-2"
      role="group"
      aria-label={question}
    >
      <span className="text-sm font-semibold">{question}</span>
      <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
        Keep it
      </Button>
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
        {label === 'Cancel' ? 'Yes, cancel' : 'Yes, stop following'}
      </Button>
    </div>
  );
}
