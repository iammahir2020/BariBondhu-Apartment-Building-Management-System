/**
 * Tests for the ticket notifications (RES-02, NFR-29): who is told about a new, cancelled or changed ticket, what
 * they read, and that a failed send never fails the change.
 *
 * @author Mahir Al Kamal
 */
import type { Ticket, TicketStatus } from '@/models';
import {
  MANAGER_TICKETS_LINK,
  notifyNewTicket,
  notifyTicketCancelled,
  notifyTicketStatusChange,
  RESIDENT_TICKETS_LINK,
  statusChangeText,
} from '@/services/ticketNotifications';
import { memoryNotices } from '@/services/testFakes';

const NOW = new Date('2026-11-25T10:00:00+06:00');

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    reportedById: 'resident-1A',
    occupancyId: 'occupancy-1A',
    category: 'Plumbing',
    flatId: null,
    placeId: 'place-pump',
    title: 'Water pump leaking',
    description: 'Water on the floor by the pump.',
    photoPath: null,
    homeTimes: null,
    status: 'Reported',
    priority: 'Normal',
    assigneeId: null,
    dueDate: null,
    instructions: null,
    foundByStaff: false,
    linkedTicketId: null,
    duplicateOfId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('notifyNewTicket', () => {
  it('tells every active manager about a new ticket, with a link to Tickets (TC-R02-01)', async () => {
    const { notices, sent, managerIds } = memoryNotices();
    managerIds.push('manager-2');
    await notifyNewTicket(notices, ticket());
    expect(sent).toEqual([
      {
        recipientId: 'manager-1',
        text: 'New fault reported: Water pump leaking',
        link: MANAGER_TICKETS_LINK,
      },
      {
        recipientId: 'manager-2',
        text: 'New fault reported: Water pump leaking',
        link: MANAGER_TICKETS_LINK,
      },
    ]);
  });

  it('says Urgent first for an Urgent ticket (TC-R02-11)', async () => {
    const { notices, sent } = memoryNotices();
    await notifyNewTicket(
      notices,
      ticket({ priority: 'Urgent', title: 'Someone stuck in the lift' }),
    );
    expect(sent[0]?.text).toBe('Urgent fault reported: Someone stuck in the lift');
  });

  it('sends nothing when there is no active manager', async () => {
    const { notices, sent, managerIds } = memoryNotices();
    managerIds.length = 0;
    await notifyNewTicket(notices, ticket());
    expect(sent).toEqual([]);
  });

  it('tells a manager once even if they are listed twice', async () => {
    const { notices, sent, managerIds } = memoryNotices();
    managerIds.push('manager-1');
    await notifyNewTicket(notices, ticket());
    expect(sent).toHaveLength(1);
  });
});

describe('notifyTicketCancelled', () => {
  it('tells the manager that the resident cancelled the ticket (TC-R02-17)', async () => {
    const { notices, sent } = memoryNotices();
    await notifyTicketCancelled(notices, ticket({ status: 'Cancelled' }));
    expect(sent).toEqual([
      {
        recipientId: 'manager-1',
        text: 'Cancelled by the resident: Water pump leaking',
        link: MANAGER_TICKETS_LINK,
      },
    ]);
  });
});

describe('notifyTicketStatusChange', () => {
  it('tells every follower household when the manager assigns the ticket (TC-R02-21)', async () => {
    const { notices, sent, followers } = memoryNotices();
    followers.set('ticket-1', ['resident-1A', 'resident-2B']);
    await notifyTicketStatusChange(notices, ticket(), {
      from: 'Reported',
      to: 'Assigned',
      changedById: 'manager-1',
    });
    expect(sent).toEqual([
      {
        recipientId: 'resident-1A',
        text: '"Water pump leaking" has been assigned to a staff member.',
        link: RESIDENT_TICKETS_LINK,
      },
      {
        recipientId: 'resident-2B',
        text: '"Water pump leaking" has been assigned to a staff member.',
        link: RESIDENT_TICKETS_LINK,
      },
    ]);
  });

  it('does not tell the account that made the change', async () => {
    const { notices, sent, followers } = memoryNotices();
    followers.set('ticket-1', ['resident-1A', 'resident-2B']);
    await notifyTicketStatusChange(notices, ticket(), {
      from: 'Reported',
      to: 'Cancelled',
      changedById: 'resident-1A',
    });
    expect(sent.map((n) => n.recipientId)).toEqual(['resident-2B']);
  });

  it('sends nothing when nobody follows the ticket (a fault found by staff)', async () => {
    const { notices, sent } = memoryNotices();
    await notifyTicketStatusChange(notices, ticket({ foundByStaff: true }), {
      from: 'Reported',
      to: 'Assigned',
      changedById: 'manager-1',
    });
    expect(sent).toEqual([]);
  });

  it('only asks for the followers of this ticket', async () => {
    const { notices, sent, followers } = memoryNotices();
    followers.set('ticket-2', ['resident-3C']);
    await notifyTicketStatusChange(notices, ticket(), {
      from: 'Assigned',
      to: 'In progress',
      changedById: 'maintenance-1',
    });
    expect(sent).toEqual([]);
  });

  it('logs a failed send and still tells the other followers', async () => {
    const { notices, followers } = memoryNotices();
    followers.set('ticket-1', ['resident-1A', 'resident-2B']);
    const delivered: string[] = [];
    const error = new Error('database down');
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      notifyTicketStatusChange(
        {
          ...notices,
          notify: async (n) => {
            if (n.recipientId === 'resident-1A') throw error;
            delivered.push(n.recipientId);
          },
        },
        ticket(),
        { from: 'In progress', to: 'Fixed', changedById: 'maintenance-1' },
      ),
    ).resolves.toBeUndefined();
    expect(delivered).toEqual(['resident-2B']);
    expect(logged).toHaveBeenCalledWith('Could not send a notification', error);
    logged.mockRestore();
  });
});

describe('statusChangeText', () => {
  const title = { title: 'Lobby light flickering' };

  it.each<[TicketStatus, TicketStatus, string]>([
    ['Reported', 'Assigned', 'has been assigned to a staff member'],
    ['Assigned', 'In progress', 'is being worked on'],
    ['In progress', 'On hold', 'is on hold'],
    ['On hold', 'In progress', 'is being worked on'],
    ['In progress', 'Fixed', 'has been fixed'],
    ['Fixed', 'Closed', 'is closed'],
    ['Reported', 'Cancelled', 'was cancelled'],
    ['Reported', 'Duplicate', 'was marked as a duplicate of another ticket'],
    ['Reported', "Won't fix", "won't be fixed"],
  ])('says what %s to %s means', (from, to, phrase) => {
    expect(statusChangeText(title, { from, to })).toBe(`"Lobby light flickering" ${phrase}.`);
  });

  it('says a Fixed ticket sent back to Assigned was reopened (BM-07)', () => {
    expect(statusChangeText(title, { from: 'Fixed', to: 'Assigned' })).toBe(
      '"Lobby light flickering" was reopened.',
    );
  });

  it('adds the reason when one was given (BM-06)', () => {
    expect(
      statusChangeText(title, {
        from: 'Reported',
        to: "Won't fix",
        reason: '  The bulb is fine  ',
      }),
    ).toBe('"Lobby light flickering" won\'t be fixed. Reason: The bulb is fine');
  });

  it('leaves out a blank reason', () => {
    expect(statusChangeText(title, { from: 'In progress', to: 'On hold', reason: '   ' })).toBe(
      '"Lobby light flickering" is on hold.',
    );
  });

  it('has a phrase for Reported too, so every status is covered', () => {
    expect(statusChangeText(title, { from: 'Assigned', to: 'Reported' })).toBe(
      '"Lobby light flickering" was reported.',
    );
  });
});
