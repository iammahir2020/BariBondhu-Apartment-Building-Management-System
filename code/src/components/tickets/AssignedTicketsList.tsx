'use client';

/**
 * Maintenance worker's assigned tickets list (MNT-01).
 *
 * @author Adika Rahman
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import type { AssignedTicketSummary } from '@/services/assignedTicketService';

type TicketsResponse = {
  tickets: AssignedTicketSummary[];
};

/**
 * Displays the tickets assigned to the logged-in maintenance worker.
 *
 * @returns The assigned tickets list.
 */
export function AssignedTicketsList() {
  const [tickets, setTickets] = useState<AssignedTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTickets() {
      setLoading(true);
      setError(null);

      const result = await callApi<TicketsResponse>('/api/maintenance/tickets', 'GET');

      if (!result.ok) {
        setError(result.error.message || 'Could not reach the server.');
        setLoading(false);
        return;
      }

      setTickets(result.data.tickets);
      setLoading(false);
    }

    void loadTickets();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading tickets...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">My tickets</h1>

      {tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">You do not have any assigned tickets yet.</p>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{ticket.title}</h2>
                <Badge>{ticket.status}</Badge>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-medium">Place:</span> {ticket.place}
                </p>
                <p>
                  <span className="font-medium">Category:</span> {ticket.category}
                </p>
                <p>
                  <span className="font-medium">Priority:</span> {ticket.priority}
                </p>
                <p>
                  <span className="font-medium">Due date:</span>{' '}
                  {ticket.dueDate
                    ? new Date(`${ticket.dueDate}T00:00:00`).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'No due date'}
                </p>
              </div>

              <Link
                href={`/maintenance/tickets/${ticket.id}`}
                className="text-sm font-semibold text-primary underline underline-offset-4 hover:opacity-80"
              >
                View details
              </Link>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
