/**
 * The maintenance worker's assigned tickets list (MNT-01).
 *
 * @author Adika Rahman
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/apiClient';
import type { AssignedTicketSummary } from '@/services/assignedTicketService';

/** Displays a date in a readable format. */
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

/**
 * Shows tickets assigned to the signed-in maintenance worker.
 *
 * @returns The assigned tickets list.
 */
export function AssignedTicketsList() {
  const [tickets, setTickets] = useState<AssignedTicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const result = await callApi<{ tickets: AssignedTicketSummary[] }>(
      '/api/maintenance/tickets',
      'GET',
    );

    if (result.ok) {
      setTickets(result.data.tickets);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-bold">My tickets</h1>

      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {tickets === null && !error && (
        <p className="text-sm text-muted-foreground">Loading tickets...</p>
      )}

      {tickets?.length === 0 && (
        <p className="text-sm text-muted-foreground">You do not have any assigned tickets yet.</p>
      )}

      {tickets && tickets.length > 0 && (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-base font-semibold">{ticket.title ?? 'Untitled ticket'}</h2>

                <Badge variant="outline">{ticket.status}</Badge>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
