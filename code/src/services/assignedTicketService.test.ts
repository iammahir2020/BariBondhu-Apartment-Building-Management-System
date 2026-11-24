/**
 * Tests for the assigned-ticket service using an in-memory fake store.
 *
 * @author Adika Rahman
 */
import {
  getMyAssignedTicket,
  listMyAssignedTickets,
  type AssignedTicketDetails,
  type AssignedTicketStore,
  type AssignedTicketSummary,
} from './assignedTicketService';

/** Creates a ticket summary for service tests. */
function makeTicket(
  id: string,
  priority: AssignedTicketSummary['priority'],
  dueDate: string | null,
): AssignedTicketSummary {
  return {
    id,
    title: `Ticket ${id}`,
    place: 'Block A, Flat 302',
    category: 'Plumbing',
    priority,
    dueDate,
    status: 'Assigned',
  };
}

/** Creates a ticket detail record for service tests. */
function makeDetails(id: string): AssignedTicketDetails {
  return {
    ...makeTicket(id, 'Urgent', '2026-11-25'),
    description: 'Repair the leaking pipe.',
    photoPath: null,
    homeTimes: '10 AM to 5 PM',
    instructions: 'Check the kitchen pipe.',
  };
}

/** Creates a fake store with configurable ticket results. */
function makeStore(
  list: AssignedTicketSummary[] = [],
  detail?: AssignedTicketDetails,
): AssignedTicketStore {
  return {
    async listForAssignee() {
      return list;
    },
    async findForAssignee() {
      return detail;
    },
  };
}

describe('listMyAssignedTickets', () => {
  it('puts urgent tickets first, then sorts by due date', async () => {
    const store = makeStore([
      makeTicket('normal-late', 'Normal', '2026-11-30'),
      makeTicket('urgent-late', 'Urgent', '2026-11-29'),
      makeTicket('high-early', 'High', '2026-11-25'),
      makeTicket('urgent-early', 'Urgent', '2026-11-24'),
    ]);

    const result = await listMyAssignedTickets({ tickets: store }, 'worker-1');

    expect(result.map((ticket) => ticket.id)).toEqual([
      'urgent-early',
      'urgent-late',
      'high-early',
      'normal-late',
    ]);
  });

  it('places tickets without a due date after tickets with a due date', async () => {
    const store = makeStore([
      makeTicket('no-date', 'Urgent', null),
      makeTicket('with-date', 'Urgent', '2026-11-25'),
    ]);

    const result = await listMyAssignedTickets({ tickets: store }, 'worker-1');

    expect(result.map((ticket) => ticket.id)).toEqual(['with-date', 'no-date']);
  });

  it('returns an empty array when no tickets are assigned', async () => {
    const store = makeStore();

    const result = await listMyAssignedTickets({ tickets: store }, 'worker-1');

    expect(result).toEqual([]);
  });
});

describe('getMyAssignedTicket', () => {
  it('returns details when the ticket is assigned to the worker', async () => {
    const details = makeDetails('ticket-1');
    const store = makeStore([], details);

    const result = await getMyAssignedTicket({ tickets: store }, 'ticket-1', 'worker-1');

    expect(result).toEqual(details);
  });

  it('refuses access when the ticket is no longer assigned to the worker', async () => {
    const store = makeStore();

    await expect(
      getMyAssignedTicket({ tickets: store }, 'ticket-1', 'worker-1'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This ticket is no longer assigned to you',
    });
  });
});
