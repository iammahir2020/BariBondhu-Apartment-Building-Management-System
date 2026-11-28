'use client';

/**
 * Building manager ticket list and detail actions (BM-06, BM-07, BB-1307).
 *
 * @author Jannatul Ferdus Nishi
 */
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';
import type {
  ManagerMaintenanceStaff,
  ManagerTicketDetails,
  ManagerTicketHistoryEntry,
  ManagerTicketListItem,
  ManagerTicketWorkNote,
} from '@/services/managerTicketQueryService';
import type { TicketStatus } from '@/models/Ticket';
import { LoadingRows, LoadingBlock, LoadingInline } from '@/components/Loading';

type TicketListItemJson = Omit<ManagerTicketListItem, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

type TicketHistoryEntryJson = Omit<ManagerTicketHistoryEntry, 'changedAt'> & {
  changedAt: string;
};

type TicketWorkNoteJson = Omit<ManagerTicketWorkNote, 'createdAt'> & {
  createdAt: string;
};

type TicketDetailsJson = Omit<ManagerTicketDetails, 'ticket' | 'statusChanges' | 'workNotes'> & {
  ticket: TicketListItemJson;
  statusChanges: TicketHistoryEntryJson[];
  workNotes: TicketWorkNoteJson[];
};

interface ManagerTicketsResponse {
  tickets: TicketListItemJson[];
  maintenanceStaff: ManagerMaintenanceStaff[];
}

interface ManagerTicketDetailsResponse {
  ticket: TicketDetailsJson;
}

type TicketFilter = 'Open' | 'Reported' | 'Fixed, to close' | 'Closed' | 'All';
type TicketDialogAction = 'close' | 'reopen' | 'duplicate' | 'wont-fix' | 'reassign';
type ReassignableTicketStatus = Extract<TicketStatus, 'Assigned' | 'In progress' | 'On hold'>;

const TICKET_FILTERS: readonly TicketFilter[] = [
  'Open',
  'Reported',
  'Fixed, to close',
  'Closed',
  'All',
];

const FINAL_STATUSES: ReadonlySet<TicketStatus> = new Set([
  'Closed',
  'Cancelled',
  'Duplicate',
  "Won't fix",
]);

const STATUS_VARIANT: Readonly<Record<TicketStatus, 'warn' | 'info' | 'ok' | 'bad' | 'mute'>> = {
  Reported: 'warn',
  Assigned: 'info',
  'In progress': 'info',
  'On hold': 'warn',
  Fixed: 'ok',
  Closed: 'mute',
  Cancelled: 'mute',
  Duplicate: 'mute',
  "Won't fix": 'bad',
};

const PRIORITIES = ['Urgent', 'High', 'Normal'] as const;

/**
 * Formats a date or timestamp using the building's Dhaka time zone.
 * @param value - An ISO timestamp or `YYYY-MM-DD` date.
 * @param includeTime - Whether to include the time of day.
 * @returns A readable date, or the original value when it is invalid.
 */
function formatTicketDate(value: string, includeTime = false): string {
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00+06:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Dhaka',
  });
}

/**
 * Returns whether a ticket belongs in the selected list filter.
 * @param ticket - The ticket to check.
 * @param filter - The active list filter.
 * @returns Whether the ticket matches.
 */
function matchesTicketFilter(ticket: TicketListItemJson, filter: TicketFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Open') return !FINAL_STATUSES.has(ticket.status);
  if (filter === 'Reported') return ticket.status === 'Reported';
  if (filter === 'Fixed, to close') return ticket.status === 'Fixed';
  return ticket.status === 'Closed';
}

/**
 * Shows the manager's in-scope tickets, with assignment, decision and close/reopen actions.
 * @param props - The optional ticket selected in the detail route.
 * @returns A responsive ticket list and detail view.
 */
export function ManagerTickets({ selectedTicketId }: { selectedTicketId?: string }) {
  const [tickets, setTickets] = useState<TicketListItemJson[] | null>(null);
  const [maintenanceStaff, setMaintenanceStaff] = useState<ManagerMaintenanceStaff[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [details, setDetails] = useState<TicketDetailsJson | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [filter, setFilter] = useState<TicketFilter>('Open');
  const [staffId, setStaffId] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Normal');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [dialogAction, setDialogAction] = useState<TicketDialogAction | null>(null);
  const [reason, setReason] = useState('');
  const [originalTicketId, setOriginalTicketId] = useState('');
  const [reassignmentStaffId, setReassignmentStaffId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const result = await callApi<ManagerTicketsResponse>('/api/manager/tickets', 'GET');
    if (!result.ok) {
      setListError(result.error.message);
      setTickets(null);
      return;
    }
    setTickets(result.data.tickets);
    setMaintenanceStaff(result.data.maintenanceStaff);
    setListError(null);
  }, []);

  const photoTicketId = details?.ticket.id;
  const photoPath = details?.ticket.photoPath;

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(false);
      return;
    }

    let active = true;
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    setAssignError(null);

    void callApi<ManagerTicketDetailsResponse>(
      `/api/manager/tickets/${encodeURIComponent(selectedTicketId)}`,
      'GET',
    ).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setDetailsError(result.error.message);
      } else {
        setDetails(result.data.ticket);
      }
      setDetailsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selectedTicketId, detailRefresh]);

  useEffect(() => {
    let active = true;
    setPhotoUrl(null);
    setPhotoError(null);
    if (!photoPath || !photoTicketId) {
      setPhotoLoading(false);
      return () => {
        active = false;
      };
    }

    setPhotoLoading(true);
    void callApi<{ url: string }>(`/api/manager/tickets/${photoTicketId}/photo`, 'GET').then(
      (result) => {
        if (!active) return;
        if (result.ok) setPhotoUrl(result.data.url);
        else setPhotoError(result.error.message);
        setPhotoLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [photoTicketId, photoPath]);

  useEffect(() => {
    if (details?.ticket.status === 'Reported') {
      setPriority(details.ticket.priority);
    }
  }, [details?.ticket.id, details?.ticket.priority, details?.ticket.status]);

  const visibleTickets = useMemo(
    () => (tickets ?? []).filter((ticket) => matchesTicketFilter(ticket, filter)),
    [tickets, filter],
  );

  const openTickets = useMemo(
    () => (tickets ?? []).filter((ticket) => !FINAL_STATUSES.has(ticket.status)),
    [tickets],
  );

  function filterCount(activeFilter: TicketFilter): number {
    return (tickets ?? []).filter((ticket) => matchesTicketFilter(ticket, activeFilter)).length;
  }

  async function assignTicket(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSuccess(null);
    setAssignError(null);
    if (!staffId || !dueDate) {
      setAssignError('Choose a staff member and a due date');
      return;
    }
    if (!details) return;

    setAssigning(true);
    const result = await callApi(`/api/manager/tickets/${details.ticket.id}/assign`, 'POST', {
      staffId,
      priority,
      dueDate,
      instructions: instructions.trim(),
    });
    setAssigning(false);
    if (!result.ok) {
      setAssignError(result.error.message);
      return;
    }

    setSuccess('Ticket assigned successfully.');
    await loadTickets();
    setDetailRefresh((value) => value + 1);
  }

  function openAction(action: TicketDialogAction): void {
    setDialogAction(action);
    setReason('');
    setOriginalTicketId('');
    setReassignmentStaffId('');
    setActionError(null);
    setSuccess(null);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!details || !dialogAction) return;
    setActionError(null);
    setSuccess(null);

    const cleanReason = reason.trim();
    if (
      (dialogAction === 'reopen' || dialogAction === 'duplicate' || dialogAction === 'wont-fix') &&
      !cleanReason
    ) {
      setActionError('Give a reason.');
      return;
    }
    if (dialogAction === 'duplicate' && !originalTicketId) {
      setActionError('Choose the original ticket.');
      return;
    }
    if (dialogAction === 'reassign' && !reassignmentStaffId) {
      setActionError('Choose a different maintenance staff member.');
      return;
    }

    const ticketId = details.ticket.id;
    let url = `/api/manager/tickets/${ticketId}/close`;
    let body: unknown;
    let successMessage = 'Ticket closed.';
    if (dialogAction === 'reassign') {
      url = `/api/manager/tickets/${ticketId}/reassign`;
      body = { staffId: reassignmentStaffId };
      successMessage = 'Ticket reassigned. Its status was kept.';
    } else if (dialogAction === 'reopen') {
      url = `/api/manager/tickets/${ticketId}/reopen`;
      body = { reason: cleanReason };
      successMessage = 'Ticket reopened and assigned.';
    } else if (dialogAction === 'duplicate') {
      url = `/api/manager/tickets/${ticketId}/decision`;
      body = { decision: 'Duplicate', originalTicketId, reason: cleanReason };
      successMessage = 'Ticket marked Duplicate.';
    } else if (dialogAction === 'wont-fix') {
      url = `/api/manager/tickets/${ticketId}/decision`;
      body = { decision: "Won't fix", reason: cleanReason };
      successMessage = "Ticket marked Won't fix.";
    }

    setSavingAction(true);
    const result = await callApi(url, 'POST', body);
    setSavingAction(false);
    if (!result.ok) {
      setActionError(result.error.message);
      return;
    }

    setDialogAction(null);
    setReason('');
    setOriginalTicketId('');
    setReassignmentStaffId('');
    setSuccess(successMessage);
    await loadTickets();
    setDetailRefresh((value) => value + 1);
  }

  const ticket = details?.ticket;
  const staffName =
    ticket?.assigneeId === null || ticket?.assigneeId === undefined
      ? 'Nobody'
      : (maintenanceStaff.find((person) => person.id === ticket.assigneeId)?.displayName ??
        'Assigned maintenance staff');
  const reassignmentStaff = maintenanceStaff.filter((person) => person.id !== ticket?.assigneeId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <header>
        <h1 className="text-[1.375rem] font-bold">Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review reported faults, assign maintenance staff and follow work through to completion.
        </p>
      </header>

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-teal-900"
        >
          {success}
        </div>
      )}

      <div role="group" aria-label="Filter tickets" className="flex flex-wrap gap-2">
        {TICKET_FILTERS.map((activeFilter) => (
          <Button
            key={activeFilter}
            type="button"
            variant={filter === activeFilter ? 'secondary' : 'outline'}
            className="min-h-12"
            aria-pressed={filter === activeFilter}
            onClick={() => setFilter(activeFilter)}
          >
            {activeFilter}
            <span className="ml-1 text-xs text-muted-foreground">{filterCount(activeFilter)}</span>
          </Button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.1fr)]">
        <section
          aria-label="Ticket list"
          className={selectedTicketId ? 'hidden min-w-0 lg:block' : 'min-w-0'}
        >
          {listError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800"
            >
              <p>{listError}</p>
              <Button
                className="mt-2 min-h-12"
                variant="outline"
                onClick={() => void loadTickets()}
              >
                Try again
              </Button>
            </div>
          )}

          {tickets === null && !listError && (
            <LoadingRows label="Loading tickets…" rows={4} card={false} />
          )}

          {tickets?.length === 0 && (
            <Card>
              <CardContent className="p-4 text-muted-foreground">
                No tickets have been reported.
              </CardContent>
            </Card>
          )}

          {tickets && tickets.length > 0 && visibleTickets.length === 0 && (
            <Card>
              <CardContent className="p-4 text-muted-foreground">
                No tickets match this filter.
              </CardContent>
            </Card>
          )}

          {visibleTickets.length > 0 && (
            <ul className="flex min-w-0 flex-col gap-3">
              {visibleTickets.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/manager/tickets/${encodeURIComponent(row.id)}`}
                    aria-current={row.id === selectedTicketId ? 'page' : undefined}
                    className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Card
                      className={
                        row.id === selectedTicketId
                          ? 'border-primary p-4'
                          : 'p-4 transition-colors hover:border-primary/50'
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="font-semibold">
                            {row.title?.trim() || 'Untitled ticket'}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {row.category} · {row.place}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant={row.priority === 'Urgent' ? 'bad' : 'mute'}>
                          {row.priority}
                        </Badge>
                        {row.late && <Badge variant="bad">Late</Badge>}
                        {row.overdue && <Badge variant="bad">Overdue</Badge>}
                        {row.foundByStaff && <Badge variant="info">Found by staff</Badge>}
                      </div>
                      <div className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                        <span>
                          Assigned to:{' '}
                          {row.assigneeId ? staffNameFor(row, maintenanceStaff) : 'Nobody'}
                        </span>
                        <span>Due: {row.dueDate ? formatTicketDate(row.dueDate) : '—'}</span>
                        {row.meTooCount > 0 && <span>Me too: {row.meTooCount}</span>}
                      </div>
                      {(row.late || row.overdue) && (
                        <p className="mt-2 text-sm font-semibold text-bad">
                          {row.late && row.overdue
                            ? 'Late and overdue'
                            : row.late
                              ? 'Reported too long without an assignment'
                              : 'Past its due date'}
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-label="Ticket details"
          className={selectedTicketId ? 'min-w-0' : 'hidden min-w-0 lg:block'}
        >
          {!selectedTicketId && (
            <Card>
              <CardContent className="p-5 text-muted-foreground">
                Choose a ticket to view its details and work history.
              </CardContent>
            </Card>
          )}

          {selectedTicketId && (
            <>
              <Link
                href="/manager/tickets"
                className="mb-3 inline-flex min-h-12 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline lg:hidden"
              >
                Back to tickets
              </Link>

              {detailsLoading && <LoadingBlock label="Loading ticket details…" />}
              {detailsError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
                >
                  {detailsError}
                </div>
              )}

              {ticket && (
                <div className="flex min-w-0 flex-col gap-4">
                  {ticket.late || ticket.overdue ? (
                    <div className="flex flex-wrap gap-2">
                      {ticket.late && <Badge variant="bad">Late · needs assignment</Badge>}
                      {ticket.overdue && <Badge variant="bad">Overdue · past due date</Badge>}
                    </div>
                  ) : null}

                  <Card>
                    <CardContent className="space-y-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
                            <Badge variant={ticket.priority === 'Urgent' ? 'bad' : 'mute'}>
                              {ticket.priority}
                            </Badge>
                            {ticket.foundByStaff && <Badge variant="info">Found by staff</Badge>}
                          </div>
                          <h2 className="text-lg font-bold">
                            {ticket.title?.trim() || 'Untitled ticket'}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {ticket.category} · {ticket.place}
                          </p>
                        </div>
                      </div>

                      {ticket.meTooCount > 0 && (
                        <p className="text-sm font-semibold">
                          {ticket.meTooCount} residents tapped Me too
                        </p>
                      )}

                      <div>
                        <h3 className="text-sm font-semibold">Description</h3>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.description}</p>
                      </div>

                      {ticket.homeTimes && (
                        <p className="text-sm">
                          <span className="font-semibold">Home times:</span> {ticket.homeTimes}
                        </p>
                      )}

                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                          <span className="font-semibold">Assigned to:</span> {staffName}
                        </p>
                        <p>
                          <span className="font-semibold">Due:</span>{' '}
                          {ticket.dueDate ? formatTicketDate(ticket.dueDate) : 'Not set'}
                        </p>
                        <p>
                          <span className="font-semibold">Reported:</span>{' '}
                          {formatTicketDate(ticket.createdAt, true)}
                        </p>
                        {ticket.instructions && (
                          <p className="sm:col-span-2">
                            <span className="font-semibold">Instructions:</span>{' '}
                            {ticket.instructions}
                          </p>
                        )}
                      </div>

                      {ticket.assigneeId && isReassignableTicketStatus(ticket.status) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full sm:w-auto"
                          onClick={() => openAction('reassign')}
                        >
                          Reassign staff
                        </Button>
                      )}

                      {ticket.photoPath && (
                        <div>
                          <h3 className="mb-2 text-sm font-semibold">Ticket photo</h3>
                          {photoLoading && <LoadingInline label="Loading photo…" />}
                          {photoError && (
                            <p role="alert" className="text-sm text-bad">
                              {photoError}
                            </p>
                          )}
                          {photoUrl && (
                            <a href={photoUrl} target="_blank" rel="noreferrer">
                              <Image
                                src={photoUrl}
                                alt={`Photo for ${ticket.title?.trim() || 'ticket'}`}
                                width={960}
                                height={640}
                                unoptimized
                                className="max-h-80 w-full rounded-lg object-contain"
                              />
                            </a>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {ticket.status === 'Reported' && (
                    <Card>
                      <CardContent className="space-y-4 p-4">
                        <div>
                          <h3 className="text-base font-bold">Assign maintenance staff</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Choose a staff member, priority and due date for this Reported ticket.
                          </p>
                        </div>

                        <form className="space-y-4" onSubmit={(event) => void assignTicket(event)}>
                          <div className="space-y-2">
                            <Label htmlFor="ticket-staff">Staff member</Label>
                            <select
                              id="ticket-staff"
                              value={staffId}
                              onChange={(event) => setStaffId(event.target.value)}
                              disabled={assigning || maintenanceStaff.length === 0}
                              className="h-13 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 text-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                            >
                              <option value="">Choose a staff member</option>
                              {maintenanceStaff.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.displayName}
                                </option>
                              ))}
                            </select>
                            {maintenanceStaff.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                No active maintenance staff are available.
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="ticket-priority">Priority</Label>
                            <select
                              id="ticket-priority"
                              value={priority}
                              onChange={(event) => {
                                const selectedPriority = PRIORITIES.find(
                                  (option) => option === event.target.value,
                                );
                                if (selectedPriority) setPriority(selectedPriority);
                              }}
                              disabled={assigning}
                              className="h-13 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 text-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                            >
                              {PRIORITIES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="ticket-due-date">Due date</Label>
                            <Input
                              id="ticket-due-date"
                              type="date"
                              min={todayInDhaka()}
                              value={dueDate}
                              onChange={(event) => setDueDate(event.target.value)}
                              disabled={assigning}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="ticket-instructions">Instructions (optional)</Label>
                            <textarea
                              id="ticket-instructions"
                              value={instructions}
                              onChange={(event) => setInstructions(event.target.value)}
                              disabled={assigning}
                              rows={3}
                              className="w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                            />
                          </div>

                          {assignError && (
                            <p role="alert" className="text-sm text-bad">
                              {assignError}
                            </p>
                          )}

                          <Button className="min-h-12 w-full" disabled={assigning}>
                            {assigning ? 'Assigning…' : 'Assign ticket'}
                          </Button>
                        </form>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-12 flex-1"
                            onClick={() => openAction('duplicate')}
                          >
                            Mark Duplicate
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-12 flex-1"
                            onClick={() => openAction('wont-fix')}
                          >
                            Won&apos;t fix
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {ticket.status === 'Fixed' && (
                    <Card>
                      <CardContent className="space-y-3 p-4">
                        <h3 className="text-base font-bold">Confirm the repair</h3>
                        <p className="text-sm text-muted-foreground">
                          Close the ticket if the repair is complete, or reopen it with a reason if
                          it did not work.
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            className="min-h-12 flex-1"
                            onClick={() => openAction('close')}
                          >
                            Close ticket
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-12 flex-1"
                            onClick={() => openAction('reopen')}
                          >
                            Reopen ticket
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="space-y-4 p-4">
                      <div>
                        <h3 className="text-base font-bold">Status history</h3>
                        {details.statusChanges.length === 0 ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No status changes have been recorded.
                          </p>
                        ) : (
                          <ol className="mt-3 space-y-3">
                            {details.statusChanges.map((change, index) => (
                              <li
                                key={`${change.toStatus}-${change.changedAt}-${index}`}
                                className="border-l-2 border-border pl-3"
                              >
                                <p className="text-sm font-semibold">
                                  {change.fromStatus
                                    ? `${change.fromStatus} → ${change.toStatus}`
                                    : change.toStatus}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {formatTicketDate(change.changedAt, true)} ·{' '}
                                  {change.changedByName}
                                </p>
                                {change.reason && (
                                  <p className="mt-1 text-sm">Reason: {change.reason}</p>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>

                      <div>
                        <h3 className="text-base font-bold">Work notes</h3>
                        {details.workNotes.length === 0 ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No work notes have been added.
                          </p>
                        ) : (
                          <ol className="mt-3 space-y-3">
                            {details.workNotes.map((note) => (
                              <li key={note.id} className="rounded-lg bg-muted/50 p-3">
                                <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {note.authorName} · {formatTicketDate(note.createdAt, true)}
                                </p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog
        open={dialogAction !== null}
        onOpenChange={(open) => {
          if (!open && !savingAction) {
            setDialogAction(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <form className="space-y-4" onSubmit={(event) => void submitAction(event)}>
            <DialogHeader>
              <DialogTitle>{dialogTitle(dialogAction)}</DialogTitle>
              <DialogDescription>{dialogDescription(dialogAction)}</DialogDescription>
            </DialogHeader>

            {dialogAction === 'duplicate' && (
              <div className="space-y-2">
                <Label htmlFor="ticket-original">Original ticket</Label>
                <select
                  id="ticket-original"
                  value={originalTicketId}
                  onChange={(event) => setOriginalTicketId(event.target.value)}
                  disabled={savingAction}
                  className="h-13 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 text-base"
                >
                  <option value="">Choose the original ticket</option>
                  {openTickets
                    .filter((openTicket) => openTicket.id !== selectedTicketId)
                    .map((openTicket) => (
                      <option key={openTicket.id} value={openTicket.id}>
                        {openTicket.title?.trim() || 'Untitled ticket'} · {openTicket.place}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {dialogAction === 'reassign' && (
              <div className="space-y-2">
                <Label htmlFor="ticket-reassign-staff">New maintenance staff</Label>
                <select
                  id="ticket-reassign-staff"
                  value={reassignmentStaffId}
                  onChange={(event) => setReassignmentStaffId(event.target.value)}
                  disabled={savingAction || reassignmentStaff.length === 0}
                  className="h-13 w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 text-base"
                >
                  <option value="">Choose a different staff member</option>
                  {reassignmentStaff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
                {reassignmentStaff.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No other active maintenance staff are available.
                  </p>
                )}
              </div>
            )}

            {(dialogAction === 'duplicate' ||
              dialogAction === 'wont-fix' ||
              dialogAction === 'reopen') && (
              <div className="space-y-2">
                <Label htmlFor="ticket-action-reason">Reason</Label>
                <textarea
                  id="ticket-action-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={savingAction}
                  rows={3}
                  className="w-full rounded-lg border-[1.5px] border-input bg-card px-3.5 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                />
              </div>
            )}

            {actionError && (
              <p role="alert" className="text-sm text-bad">
                {actionError}
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12"
                  disabled={savingAction}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                className="min-h-12"
                disabled={
                  savingAction || (dialogAction === 'reassign' && reassignmentStaff.length === 0)
                }
              >
                {savingAction ? 'Saving…' : dialogSubmitLabel(dialogAction)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Formats today's date using the same time zone as ticket assignment validation.
 * @returns Today's date in `YYYY-MM-DD` format for the date input's minimum.
 */
function todayInDhaka(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

/**
 * Gets a known active staff member's display name for a list row.
 * @param ticketRow - The ticket being displayed.
 * @param staff - Active maintenance profiles returned by the manager API.
 * @returns The staff name, or a safe label if the current assignee is not active.
 */
function staffNameFor(
  ticketRow: TicketListItemJson,
  staff: readonly ManagerMaintenanceStaff[],
): string {
  if (!ticketRow.assigneeId) return 'Nobody';
  return (
    staff.find((person) => person.id === ticketRow.assigneeId)?.displayName ?? 'Assigned staff'
  );
}

/**
 * Whether the ticket's current work state can be preserved while changing its assignee.
 * @param status - Current ticket status.
 * @returns True for the maintenance work states eligible for reassignment.
 */
function isReassignableTicketStatus(status: TicketStatus): status is ReassignableTicketStatus {
  return status === 'Assigned' || status === 'In progress' || status === 'On hold';
}

/**
 * Returns the dialog heading for the selected action.
 * @param action - The pending ticket action.
 * @returns The heading text.
 */
function dialogTitle(action: TicketDialogAction | null): string {
  if (action === 'close') return 'Close this ticket?';
  if (action === 'reopen') return 'Reopen this ticket?';
  if (action === 'duplicate') return 'Mark this ticket Duplicate?';
  if (action === 'wont-fix') return "Mark this ticket Won't fix?";
  if (action === 'reassign') return 'Reassign this ticket?';
  return 'Update ticket';
}

/**
 * Returns the explanatory text for the selected action.
 * @param action - The pending ticket action.
 * @returns The action explanation.
 */
function dialogDescription(action: TicketDialogAction | null): string {
  if (action === 'close')
    return 'This confirms the repair is finished. A Closed ticket cannot be reopened.';
  if (action === 'reopen')
    return 'The Fixed ticket will return to Assigned. Give a reason for reopening it.';
  if (action === 'duplicate')
    return 'Choose the original open ticket and explain why these reports are duplicates.';
  if (action === 'wont-fix') return 'Explain why this reported fault will not be fixed.';
  if (action === 'reassign')
    return 'Choose a different active maintenance worker. The ticket status will not change.';
  return '';
}

/**
 * Returns the submit label for the selected action.
 * @param action - The pending ticket action.
 * @returns The button label.
 */
function dialogSubmitLabel(action: TicketDialogAction | null): string {
  if (action === 'close') return 'Confirm close';
  if (action === 'reopen') return 'Reopen ticket';
  if (action === 'duplicate') return 'Mark Duplicate';
  if (action === 'wont-fix') return "Mark Won't fix";
  if (action === 'reassign') return 'Reassign ticket';
  return 'Save';
}
