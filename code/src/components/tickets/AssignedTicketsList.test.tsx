/**
 * @jest-environment jsdom
 */

/**
 * Tests for the maintenance worker's assigned tickets list (MNT-01).
 *
 * @author Adika Rahman
 */
import { render, screen } from '@testing-library/react';
import { answerFetchByRoute, failFetch } from '@/components/auth/testFetch';
import { AssignedTicketsList } from './AssignedTicketsList';
import type { AssignedTicketSummary } from '@/services/assignedTicketService';

const TICKETS: AssignedTicketSummary[] = [
  {
    id: 'ticket-1',
    title: 'Kitchen tap leaking',
    place: 'Flat 3A',
    category: 'Plumbing',
    priority: 'Urgent',
    dueDate: '2026-11-14',
    status: 'Assigned',
  },
  {
    id: 'ticket-2',
    title: 'Corridor light not working',
    place: 'Floor 5',
    category: 'Electrical',
    priority: 'Normal',
    dueDate: null,
    status: 'In progress',
  },
];

function serve(tickets: AssignedTicketSummary[]) {
  return answerFetchByRoute([
    {
      method: 'GET',
      url: '/api/maintenance/tickets',
      status: 200,
      body: { tickets },
    },
  ]);
}

describe('AssignedTicketsList', () => {
  it('shows the assigned tickets and their information', async () => {
    const fetch = serve(TICKETS);

    render(<AssignedTicketsList />);

    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument();
    await screen.findByText('Kitchen tap leaking');

    expect(screen.getByText('Kitchen tap leaking')).toBeInTheDocument();
    expect(screen.getByText('Flat 3A')).toBeInTheDocument();
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('14 Nov 2026')).toBeInTheDocument();

    expect(screen.getByText('Corridor light not working')).toBeInTheDocument();
    expect(screen.getByText('Floor 5')).toBeInTheDocument();
    expect(screen.getByText('Electrical')).toBeInTheDocument();
    expect(screen.getByText('No due date')).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledWith(
      '/api/maintenance/tickets',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('shows a message when there are no assigned tickets', async () => {
    serve([]);

    render(<AssignedTicketsList />);

    expect(
      await screen.findByText('You do not have any assigned tickets yet.'),
    ).toBeInTheDocument();
  });

  it('shows an error when the API cannot be reached', async () => {
    failFetch();

    render(<AssignedTicketsList />);

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });
});
