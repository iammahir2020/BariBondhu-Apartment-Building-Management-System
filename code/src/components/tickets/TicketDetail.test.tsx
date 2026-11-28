/**
 * @jest-environment jsdom
 */

/**
 * Tests for the maintenance worker's assigned ticket detail page.
 *
 * @author Adika Rahman
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { answerFetchByRoute } from '@/components/auth/testFetch';
import { TicketDetail } from './TicketDetail';
import type { AssignedTicketDetails } from '@/services/assignedTicketService';

const TICKET: AssignedTicketDetails = {
  id: 'ticket-1',
  title: 'Kitchen tap leaking',
  place: 'Flat 3A',
  category: 'Plumbing',
  priority: 'Urgent',
  dueDate: '2026-11-14',
  status: 'In progress',
  description: 'The kitchen tap is leaking.',
  photoPath: null,
  homeTimes: 'Evening',
  instructions: 'Contact the resident before visiting.',
};

function serveTicket() {
  return answerFetchByRoute([
    {
      method: 'GET',
      url: '/api/maintenance/tickets/ticket-1',
      status: 200,
      body: { ticket: TICKET },
    },
  ]);
}

describe('TicketDetail', () => {
  it('shows ticket information', async () => {
    serveTicket();

    render(<TicketDetail ticketId="ticket-1" />);

    expect(await screen.findByRole('heading', { name: 'Kitchen tap leaking' })).toBeInTheDocument();

    expect(screen.getByText('Flat 3A')).toBeInTheDocument();
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('The kitchen tap is leaking.')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();
    expect(screen.getByText('Contact the resident before visiting.')).toBeInTheDocument();
  });

  it('changes ticket status to fixed', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/maintenance/tickets/ticket-1',
        status: 200,
        body: { ticket: TICKET },
      },
      {
        method: 'PATCH',
        url: '/api/maintenance/tickets/ticket-1',
        status: 200,
        body: {
          ticket: { ...TICKET, status: 'Fixed' },
        },
      },
    ]);

    render(<TicketDetail ticketId="ticket-1" />);

    await screen.findByRole('heading', { name: 'Kitchen tap leaking' });

    fireEvent.click(screen.getByRole('button', { name: 'Mark as fixed' }));

    expect(await screen.findByText('Ticket status changed to Fixed.')).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledWith(
      '/api/maintenance/tickets/ticket-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.any(String),
      }),
    );
  });

  it('requires a reason before putting a ticket on hold', async () => {
    serveTicket();

    render(<TicketDetail ticketId="ticket-1" />);

    await screen.findByRole('heading', { name: 'Kitchen tap leaking' });

    expect(screen.getByRole('button', { name: 'Put on hold' })).toBeDisabled();
  });

  it('submits a work note', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/maintenance/tickets/ticket-1',
        status: 200,
        body: { ticket: TICKET },
      },
      {
        method: 'POST',
        url: '/api/maintenance/tickets/ticket-1/notes',
        status: 201,
        body: {
          note: {
            id: 'note-1',
            ticketId: 'ticket-1',
            authorId: 'worker-1',
            text: 'Tap repaired successfully.',
            createdAt: '2026-11-28T10:00:00.000Z',
          },
        },
      },
    ]);

    render(<TicketDetail ticketId="ticket-1" />);

    await screen.findByRole('heading', { name: 'Kitchen tap leaking' });

    fireEvent.change(screen.getByLabelText('Work note'), {
      target: { value: 'Tap repaired successfully.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit work note' }));

    expect(await screen.findByText('Work note added successfully.')).toBeInTheDocument();

    expect(screen.getByText('Tap repaired successfully.')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/maintenance/tickets/ticket-1/notes',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
