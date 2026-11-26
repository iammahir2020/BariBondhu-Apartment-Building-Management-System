/**
 * BB-1304: Manager ticket close and reopen service tests.
 *
 * @author Jannatul Ferdus Nishi
 */
import {
  closeFixedTicket,
  reopenFixedTicket,
  type ManagerTicketCloseReopenDeps,
  type ReopenFixedTicketInput,
  type TicketCloseReopenSnapshot,
} from './managerTicketCloseReopenService';

const NOW = new Date('2026-11-26T08:00:00.000Z');

const closeInput = { ticketId: 'ticket-1', managerId: 'manager-1' };
const reopenInput: ReopenFixedTicketInput = {
  ...closeInput,
  reason: 'The leak has returned.',
};

function setup(initialStatus: TicketCloseReopenSnapshot['status'] = 'Fixed') {
  const tickets = new Map<string, TicketCloseReopenSnapshot>([
    [
      'ticket-1',
      {
        id: 'ticket-1',
        status: initialStatus,
        title: 'Water pipe leak',
        assigneeId: 'staff-1',
      },
    ],
  ]);
  const findTicket = jest.fn(async (ticketId: string) => tickets.get(ticketId));
  const saveStatusChangeIfFixed = jest.fn(
    async (input: { ticketId: string; status: 'Closed' | 'Assigned' }) => {
      const current = tickets.get(input.ticketId);
      if (!current || current.status !== 'Fixed') return false;
      tickets.set(input.ticketId, { ...current, status: input.status });
      return true;
    },
  );
  const audit = jest.fn().mockResolvedValue(undefined);
  const activeManagerIds = jest.fn().mockResolvedValue([]);
  const followerAccountIds = jest.fn().mockResolvedValue(['reporter-1', 'follower-1', 'manager-1']);
  const notify = jest.fn().mockResolvedValue(undefined);
  const deps: ManagerTicketCloseReopenDeps = {
    tickets: { findTicket, saveStatusChangeIfFixed },
    audit,
    notices: {
      recipients: { activeManagerIds, followerAccountIds },
      notify,
    },
  };

  return {
    deps,
    tickets,
    findTicket,
    saveStatusChangeIfFixed,
    audit,
    followerAccountIds,
    notify,
  };
}

describe('BB-1304: close a Fixed ticket', () => {
  it('closes the ticket, records history and audit, and notifies its followers', async () => {
    const { deps, tickets, saveStatusChangeIfFixed, audit, followerAccountIds, notify } = setup();

    await expect(closeFixedTicket(deps, closeInput, NOW)).resolves.toEqual({
      ticketId: 'ticket-1',
      status: 'Closed',
    });

    expect(tickets.get('ticket-1')?.status).toBe('Closed');
    expect(saveStatusChangeIfFixed).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        status: 'Closed',
        change: expect.objectContaining({
          ticketId: 'ticket-1',
          fromStatus: 'Fixed',
          toStatus: 'Closed',
          changedById: 'manager-1',
          reason: null,
          createdAt: NOW,
        }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'manager-1',
        action: 'ticket.close',
        entityId: 'ticket-1',
        oldValues: { status: 'Fixed' },
        newValues: { status: 'Closed' },
      }),
    );
    expect(followerAccountIds).toHaveBeenCalledWith('ticket-1');
    expect(notify.mock.calls.map(([notification]) => notification)).toEqual([
      {
        recipientId: 'reporter-1',
        text: '"Water pipe leak" is closed.',
        link: '/resident/tickets',
      },
      {
        recipientId: 'follower-1',
        text: '"Water pipe leak" is closed.',
        link: '/resident/tickets',
      },
    ]);
  });

  it.each(['Reported', 'Assigned', 'In progress', 'On hold', 'Closed'] as const)(
    'refuses a %s ticket without writing audit or notifications',
    async (status) => {
      const { deps, saveStatusChangeIfFixed, audit, notify } = setup(status);

      await expect(closeFixedTicket(deps, closeInput, NOW)).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('reports a missing ticket', async () => {
    const { deps, saveStatusChangeIfFixed } = setup();

    await expect(
      closeFixedTicket(deps, { ...closeInput, ticketId: 'missing' }, NOW),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ticket not found.',
    });

    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
  });

  it('rejects blank identifiers before reading the ticket', async () => {
    const { deps, findTicket, saveStatusChangeIfFixed } = setup();

    await expect(
      closeFixedTicket(deps, { ...closeInput, managerId: '  ' }, NOW),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect(findTicket).not.toHaveBeenCalled();
    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
  });

  it('reports a concurrent status change without auditing or notifying', async () => {
    const { deps, saveStatusChangeIfFixed, audit, notify } = setup();
    saveStatusChangeIfFixed.mockResolvedValue(false);

    await expect(closeFixedTicket(deps, closeInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The ticket has changed. Refresh and try again.',
    });

    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('BB-1304: reopen a Fixed ticket', () => {
  it('reopens the ticket as Assigned, keeps its assignee, audits, and notifies followers and staff', async () => {
    const { deps, tickets, saveStatusChangeIfFixed, audit, notify } = setup();

    await expect(
      reopenFixedTicket(deps, { ...reopenInput, reason: '  The leak has returned.  ' }, NOW),
    ).resolves.toEqual({
      ticketId: 'ticket-1',
      status: 'Assigned',
      reason: 'The leak has returned.',
    });

    expect(tickets.get('ticket-1')).toMatchObject({
      status: 'Assigned',
      assigneeId: 'staff-1',
    });
    expect(saveStatusChangeIfFixed).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        status: 'Assigned',
        change: expect.objectContaining({
          ticketId: 'ticket-1',
          fromStatus: 'Fixed',
          toStatus: 'Assigned',
          changedById: 'manager-1',
          reason: 'The leak has returned.',
          createdAt: NOW,
        }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'manager-1',
        action: 'ticket.reopen',
        entityId: 'ticket-1',
        oldValues: { status: 'Fixed' },
        newValues: { status: 'Assigned', reason: 'The leak has returned.' },
      }),
    );
    expect(notify.mock.calls.map(([notification]) => notification)).toEqual(
      expect.arrayContaining([
        {
          recipientId: 'reporter-1',
          text: '"Water pipe leak" was reopened. Reason: The leak has returned.',
          link: '/resident/tickets',
        },
        {
          recipientId: 'follower-1',
          text: '"Water pipe leak" was reopened. Reason: The leak has returned.',
          link: '/resident/tickets',
        },
        {
          recipientId: 'staff-1',
          text: '"Water pipe leak" was reopened. Reason: The leak has returned.',
          link: '/maintenance',
        },
      ]),
    );
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it.each(['', '   '])('requires a non-blank reason (%j)', async (reason) => {
    const { deps, saveStatusChangeIfFixed, audit, notify } = setup();

    await expect(reopenFixedTicket(deps, { ...reopenInput, reason }, NOW)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Give a reason.',
    });

    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses to reopen a Closed ticket', async () => {
    const { deps, saveStatusChangeIfFixed, audit, notify } = setup('Closed');

    await expect(reopenFixedTicket(deps, reopenInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A Closed ticket cannot be reopened. Report the fault as a new ticket.',
    });

    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['Reported', 'Assigned', 'In progress', 'On hold'] as const)(
    'refuses to reopen a %s ticket',
    async (status) => {
      const { deps, saveStatusChangeIfFixed } = setup(status);

      await expect(reopenFixedTicket(deps, reopenInput, NOW)).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
    },
  );

  it('reports a missing ticket', async () => {
    const { deps, saveStatusChangeIfFixed } = setup();

    await expect(
      reopenFixedTicket(deps, { ...reopenInput, ticketId: 'missing' }, NOW),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ticket not found.',
    });

    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
  });

  it('refuses an invalid Fixed ticket without an assigned worker', async () => {
    const { deps, saveStatusChangeIfFixed, audit, notify } = setup();
    const ticket = await deps.tickets.findTicket('ticket-1');
    if (ticket) {
      ticket.assigneeId = null;
    }

    await expect(reopenFixedTicket(deps, reopenInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The Fixed ticket has no assigned maintenance staff member.',
    });

    expect(saveStatusChangeIfFixed).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a concurrent status change without auditing or notifying', async () => {
    const { deps, saveStatusChangeIfFixed, audit, notify } = setup();
    saveStatusChangeIfFixed.mockResolvedValue(false);

    await expect(reopenFixedTicket(deps, reopenInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The ticket has changed. Refresh and try again.',
    });

    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
