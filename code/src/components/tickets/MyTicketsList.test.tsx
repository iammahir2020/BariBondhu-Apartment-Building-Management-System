/**
 * @jest-environment jsdom
 */
/**
 * Tests for My tickets (RES-02): the list and its statuses, the progress of the newest open ticket, who follows a
 * ticket, and Cancel or Stop following on a Reported ticket, which asks once and then shows what happened. Case IDs
 * are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetchByRoute, failFetch, type FakeRoute } from '@/components/auth/testFetch';
import { MyTicketsList } from './MyTicketsList';
import type { MyTicketView, TicketView } from './ticketView';

function ticket(overrides: Partial<TicketView> = {}): TicketView {
  return {
    id: 't-1',
    title: 'Kitchen tap leaking',
    category: 'Plumbing',
    status: 'Assigned',
    placeId: null,
    dueDate: '2026-11-14',
    createdAt: '2026-11-12T03:14:00.000Z',
    updatedAt: '2026-11-12T05:02:00.000Z',
    ...overrides,
  };
}

function row(overrides: Partial<TicketView> = {}, extra: Partial<MyTicketView> = {}): MyTicketView {
  return {
    ticket: ticket(overrides),
    placeName: null,
    followerCount: 1,
    reportedByMe: true,
    ...extra,
  };
}

/** The four tickets of the prototype screen. */
const PROTOTYPE: MyTicketView[] = [
  row(),
  row({
    id: 't-2',
    title: 'Bathroom fan very noisy',
    status: 'Reported',
    dueDate: null,
    createdAt: '2026-11-15T04:00:00.000Z',
  }),
  row(
    { id: 't-3', title: 'No water pressure, floors 5 to 8', status: 'In progress', placeId: 'p-1' },
    { placeName: 'Water pump', followerCount: 6, reportedByMe: false },
  ),
  row({
    id: 't-4',
    title: 'Corridor light out, floor 5',
    status: 'Closed',
    updatedAt: '2026-11-02T06:00:00.000Z',
  }),
];

function serve(tickets: MyTicketView[], more: FakeRoute[] = []): jest.Mock {
  return answerFetchByRoute([
    { method: 'GET', url: '/api/tickets', status: 200, body: { tickets } },
    ...more,
  ]);
}

describe('MyTicketsList: the list', () => {
  it('shows each ticket with its status, newest open ticket with its progress (TC-R02-22)', async () => {
    serve(PROTOTYPE);
    render(<MyTicketsList />);

    const progress = await screen.findByRole('region', { name: 'Progress of Kitchen tap leaking' });
    expect(within(progress).getByText('Inside my flat · Plumbing')).toBeInTheDocument();
    expect(within(progress).getByText('Assigned · due 14 Nov')).toBeInTheDocument();
    expect(within(progress).getByText('12 Nov, 9:14 am')).toBeInTheDocument();
    const steps = within(progress).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Reported (done)12 Nov, 9:14 am',
      'Assigned · due 14 Nov (done)',
      'In progress (to come)',
      'Fixed, then closed by the manager (to come)',
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');

    const others = within(screen.getByRole('list', { name: 'Other tickets' })).getAllByRole(
      'listitem',
    );
    expect(others.map((item) => item.querySelector('h2')?.textContent)).toEqual([
      'Bathroom fan very noisy',
      'No water pressure, floors 5 to 8',
      'Corridor light out, floor 5',
    ]);
    expect(screen.getByText('Reported 15 Nov · nobody else follows it')).toBeInTheDocument();
    expect(
      screen.getByText('Water pump · Plumbing · you follow this (Me too)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Closed 2 Nov')).toBeInTheDocument();
  });

  it('shows On hold in the place of In progress', async () => {
    serve([row({ status: 'On hold' })]);
    render(<MyTicketsList />);
    expect(await screen.findByText('On hold', { selector: 'li span span' })).toBeInTheDocument();
  });

  it('counts the other households that follow my ticket', async () => {
    serve([
      row({ status: 'Fixed' }),
      row({ id: 't-2', status: 'Reported', title: 'Lobby light' }, { followerCount: 2 }),
      row({ id: 't-3', status: 'Reported', title: 'Lift noise' }, { followerCount: 4 }),
    ]);
    render(<MyTicketsList />);
    expect(await screen.findByText(/1 other household follows it/)).toBeInTheDocument();
    expect(screen.getByText(/3 other households follow it/)).toBeInTheDocument();
  });

  it('says so when there are no tickets yet', async () => {
    serve([]);
    render(<MyTicketsList />);
    expect(await screen.findByText(/No tickets yet/)).toBeInTheDocument();
  });

  it('links to Report a fault', async () => {
    serve([]);
    render(<MyTicketsList />);
    expect(screen.getByRole('link', { name: 'Report a fault' })).toHaveAttribute(
      'href',
      '/resident/report-fault',
    );
    await screen.findByText(/No tickets yet/);
  });

  it("shows the API's error when the list can't load", async () => {
    failFetch();
    render(<MyTicketsList />);
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });

  it('offers no Cancel once a ticket is assigned (Decision 6)', async () => {
    serve([row(), row({ id: 't-4', status: 'Closed', title: 'Old' })]);
    render(<MyTicketsList />);
    await screen.findByText('Kitchen tap leaking');
    expect(screen.queryByRole('button', { name: /Cancel|Stop following/ })).toBeNull();
  });
});

describe('MyTicketsList: cancel or stop following (TC-R02-17 to TC-R02-21)', () => {
  const reported = row({ id: 't-2', title: 'Bathroom fan very noisy', status: 'Reported' });

  it('asks once, then cancels my Reported ticket and reloads the list', async () => {
    const fetch = serve(
      [reported],
      [
        {
          method: 'POST',
          url: '/api/tickets/t-2/cancel',
          status: 200,
          body: { outcome: 'cancelled' },
        },
      ],
    );
    render(<MyTicketsList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Cancel this ticket?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(await screen.findByText('Ticket cancelled.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/tickets/t-2/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch.mock.calls.filter(([url]) => url === '/api/tickets')).toHaveLength(2);
  });

  it('keeps the ticket when I say Keep it, also further down the list', async () => {
    const fetch = serve([row(), reported]);
    render(<MyTicketsList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/cancel'))).toBe(false);
  });

  it('offers Stop following when other households follow my ticket', async () => {
    serve(
      [{ ...reported, followerCount: 3 }],
      [
        {
          method: 'POST',
          url: '/api/tickets/t-2/cancel',
          status: 200,
          body: { outcome: 'unfollowed' },
        },
      ],
    );
    render(<MyTicketsList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stop following' }));
    expect(
      screen.getByText('Stop following? The ticket stays open for others.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, stop following' }));
    expect(await screen.findByText('You no longer follow this ticket.')).toBeInTheDocument();
  });

  it('offers Stop following on a ticket I only follow with Me too', async () => {
    serve([{ ...reported, reportedByMe: false, followerCount: 2 }]);
    render(<MyTicketsList />);
    expect(await screen.findByRole('button', { name: 'Stop following' })).toBeInTheDocument();
  });

  it("shows the API's message when the ticket was assigned in the meantime (409)", async () => {
    serve(
      [row(), reported],
      [
        {
          method: 'POST',
          url: '/api/tickets/t-2/cancel',
          status: 409,
          body: {
            error: {
              code: 'CONFLICT',
              message: 'Once a ticket is assigned, only the manager can close it.',
            },
          },
        },
      ],
    );
    render(<MyTicketsList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(
      await screen.findByText('Once a ticket is assigned, only the manager can close it.'),
    ).toBeInTheDocument();
  });
});
