/**
 * Maintenance worker's assigned ticket detail page (MNT-02, MNT-03, MNT-04).
 *
 * @author Adika Rahman
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { callApi } from '@/lib/apiClient';
import type {
  AssignedTicketDetails,
  MaintenanceTicketStatus,
} from '@/services/assignedTicketService';
import type { WorkNote } from '@/models/WorkNote';
import { LoadingBlock } from '@/components/Loading';

/** Displays a ticket due date. */
function formatDueDate(date: string | null): string {
  if (!date) return 'No due date';

  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) return 'Invalid date';

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Props for {@link TicketDetail}. */
export type TicketDetailProps = {
  /** ID of the assigned ticket to show. */
  ticketId: string;
};

/**
 * Shows ticket information, status actions and work note form.
 *
 * @param props - The ticket ID to display.
 * @returns The ticket detail interface.
 */
export function TicketDetail({ ticketId }: TicketDetailProps) {
  const [ticket, setTicket] = useState<AssignedTicketDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [reason, setReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<WorkNote | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    setLoading(true);

    const result = await callApi<{ ticket: AssignedTicketDetails }>(
      `/api/maintenance/tickets/${ticketId}`,
      'GET',
    );

    if (result.ok) {
      setTicket(result.data.ticket);
      setError(null);
    } else {
      setError(result.error.message);
    }

    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const changeStatus = async (status: MaintenanceTicketStatus) => {
    setSavingStatus(true);
    setError(null);
    setSuccessMessage(null);

    const result = await callApi<{ ticket: AssignedTicketDetails }>(
      `/api/maintenance/tickets/${ticketId}`,
      'PATCH',
      {
        status,
        reason: status === 'On hold' ? reason : undefined,
      },
    );

    if (result.ok) {
      setTicket(result.data.ticket);
      setReason('');
      setSuccessMessage(`Ticket status changed to ${status}.`);
    } else {
      setError(result.error.message);
    }

    setSavingStatus(false);
  };

  const submitNote = async () => {
    if (!noteText.trim()) {
      setError('Write a note before submitting.');
      return;
    }

    setSavingNote(true);
    setError(null);
    setSuccessMessage(null);

    const result = await callApi<{ note: WorkNote }>(
      `/api/maintenance/tickets/${ticketId}/notes`,
      'POST',
      { text: noteText },
    );

    if (result.ok) {
      setSavedNote(result.data.note);
      setNoteText('');
      setSuccessMessage('Work note added successfully.');
    } else {
      setError(result.error.message);
    }

    setSavingNote(false);
  };

  if (loading && !ticket) {
    return <LoadingBlock label="Loading ticket details..." />;
  }

  if (!ticket) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Ticket could not be loaded.'}</AlertDescription>
        </Alert>

        <Button variant="outline" onClick={() => void loadTicket()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{ticket.title ?? 'Untitled ticket'}</h1>

        <Badge variant="outline">{ticket.status}</Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-4 p-4">
        <h2 className="font-semibold">Ticket information</h2>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="font-semibold">Place:</span> {ticket.place}
          </p>

          <p>
            <span className="font-semibold">Category:</span> {ticket.category}
          </p>

          <p>
            <span className="font-semibold">Priority:</span> {ticket.priority}
          </p>

          <p>
            <span className="font-semibold">Due date:</span> {formatDueDate(ticket.dueDate)}
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-semibold">Description</h3>
          <p>{ticket.description || 'No description provided.'}</p>
        </div>

        {ticket.homeTimes && (
          <div className="flex flex-col gap-2 text-sm">
            <h3 className="font-semibold">Preferred home times</h3>
            <p>{ticket.homeTimes}</p>
          </div>
        )}

        {ticket.instructions && (
          <div className="flex flex-col gap-2 text-sm">
            <h3 className="font-semibold">Instructions</h3>
            <p>{ticket.instructions}</p>
          </div>
        )}
      </Card>

      <Card className="gap-4 p-4">
        <h2 className="font-semibold">Update ticket status</h2>

        {ticket.status === 'Assigned' && (
          <Button disabled={savingStatus} onClick={() => void changeStatus('In progress')}>
            {savingStatus ? 'Updating...' : 'Start work'}
          </Button>
        )}

        {ticket.status === 'In progress' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="hold-reason" className="text-sm font-medium">
                Reason for putting ticket on hold
              </label>

              <Input
                id="hold-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter reason"
                maxLength={500}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={savingStatus || !reason.trim()}
                onClick={() => void changeStatus('On hold')}
              >
                Put on hold
              </Button>

              <Button disabled={savingStatus} onClick={() => void changeStatus('Fixed')}>
                Mark as fixed
              </Button>
            </div>
          </div>
        )}

        {ticket.status === 'On hold' && (
          <Button disabled={savingStatus} onClick={() => void changeStatus('In progress')}>
            Resume work
          </Button>
        )}

        {ticket.status === 'Fixed' && (
          <p className="text-sm text-muted-foreground">
            This ticket is marked as fixed. Waiting for manager review.
          </p>
        )}
      </Card>

      <Card className="gap-4 p-4">
        <h2 className="font-semibold">Add work note</h2>

        <div className="flex flex-col gap-2">
          <label htmlFor="work-note" className="text-sm font-medium">
            Work note
          </label>

          <textarea
            id="work-note"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Describe the work performed..."
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <p className="text-right text-xs text-muted-foreground">
            {noteText.length}/1000 characters
          </p>
        </div>

        <Button disabled={savingNote || !noteText.trim()} onClick={() => void submitNote()}>
          {savingNote ? 'Submitting...' : 'Submit work note'}
        </Button>

        {savedNote && (
          <div className="rounded-lg border p-3">
            <p className="text-sm font-semibold">Latest note added</p>
            <p className="mt-2 text-sm">{savedNote.text}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
