/**
 * Tests for the assigned-ticket service using an in-memory fake store.
 *
 * @author Adika Rahman
 */
import {
  changeMyAssignedTicketStatus,
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
function makeDetails(
  id: string,
  status: AssignedTicketDetails['status'] = 'Assigned',
): AssignedTicketDetails {
  return {
    ...makeTicket(id, 'Urgent', '2026-11-25'),
    status,
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
  updateResult = true,
  changes: Parameters<AssignedTicketStore['updateStatusForAssignee']>[3][] = [],
): AssignedTicketStore {
  return {
    async assigneeIdFor() {
      return detail?.id ? 'worker-1' : null;
    },
    async listForAssignee() {
      return list;
    },
    async findForAssignee() {
      return detail;
    },
    async updateStatusForAssignee(_ticketId, _assigneeId, _expectedStatus, change) {
      changes.push(change);
      return updateResult;
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

describe('changeMyAssignedTicketStatus', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');

  it('starts an Assigned ticket by changing it to In progress', async () => {
    const details = makeDetails('ticket-1', 'Assigned');
    const store = makeStore([], details);

    const result = await changeMyAssignedTicketStatus(
      { tickets: store },
      'ticket-1',
      'worker-1',
      'In progress',
      undefined,
      now,
    );

    expect(result.status).toBe('In progress');
  });

  it('puts an In progress ticket On hold with a reason', async () => {
    const details = makeDetails('ticket-2', 'In progress');
    const store = makeStore([], details);

    const result = await changeMyAssignedTicketStatus(
      { tickets: store },
      'ticket-2',
      'worker-1',
      'On hold',
      'Waiting for spare parts',
      now,
    );

    expect(result.status).toBe('On hold');
  });

  it('resumes an On hold ticket by changing it to In progress', async () => {
    const details = makeDetails('ticket-3', 'On hold');
    const store = makeStore([], details);

    const result = await changeMyAssignedTicketStatus(
      { tickets: store },
      'ticket-3',
      'worker-1',
      'In progress',
      undefined,
      now,
    );

    expect(result.status).toBe('In progress');
  });

  it('marks an In progress ticket as Fixed', async () => {
    const details = makeDetails('ticket-4', 'In progress');
    const store = makeStore([], details);

    const result = await changeMyAssignedTicketStatus(
      { tickets: store },
      'ticket-4',
      'worker-1',
      'Fixed',
      undefined,
      now,
    );

    expect(result.status).toBe('Fixed');
  });

  it('does not allow an Assigned ticket to go directly to Fixed', async () => {
    const details = makeDetails('ticket-5', 'Assigned');
    const store = makeStore([], details);

    await expect(
      changeMyAssignedTicketStatus(
        { tickets: store },
        'ticket-5',
        'worker-1',
        'Fixed',
        undefined,
        now,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A ticket cannot go from Assigned to Fixed.',
    });
  });

  it('requires a reason when putting a ticket On hold', async () => {
    const details = makeDetails('ticket-6', 'In progress');
    const store = makeStore([], details);

    await expect(
      changeMyAssignedTicketStatus(
        { tickets: store },
        'ticket-6',
        'worker-1',
        'On hold',
        undefined,
        now,
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Give a reason.',
    });
  });

  it('rejects a whitespace-only reason when putting a ticket On hold', async () => {
    const details = makeDetails('ticket-10', 'In progress');
    const store = makeStore([], details);

    await expect(
      changeMyAssignedTicketStatus(
        { tickets: store },
        'ticket-10',
        'worker-1',
        'On hold',
        '   ',
        now,
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Give a reason.',
    });
  });

  it('refuses to change a ticket that is not assigned to the worker', async () => {
    const store = makeStore();

    await expect(
      changeMyAssignedTicketStatus(
        { tickets: store },
        'ticket-7',
        'worker-1',
        'In progress',
        undefined,
        now,
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This ticket is no longer assigned to you',
    });
  });

  it('returns a conflict when the ticket changes before the update', async () => {
    const details = makeDetails('ticket-8', 'In progress');
    const store = makeStore([], details, false);

    await expect(
      changeMyAssignedTicketStatus(
        { tickets: store },
        'ticket-8',
        'worker-1',
        'Fixed',
        undefined,
        now,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The ticket has changed. Refresh and try again.',
    });
  });

  it('records the correct status change history when putting a ticket On hold', async () => {
    const details = makeDetails('ticket-9', 'In progress');
    const changes: Parameters<AssignedTicketStore['updateStatusForAssignee']>[3][] = [];
    const store = makeStore([], details, true, changes);

    await changeMyAssignedTicketStatus(
      { tickets: store },
      'ticket-9',
      'worker-1',
      'On hold',
      'Waiting for spare parts',
      now,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      ticketId: 'ticket-9',
      fromStatus: 'In progress',
      toStatus: 'On hold',
      changedById: 'worker-1',
      reason: 'Waiting for spare parts',
      createdAt: now,
    });
  });
});
