/**
 * BB-1303: Manager ticket duplicate and Won't fix service tests.
 *
 * @author Jannatul Ferdus Nishi
 */
import {
  markTicketDuplicate,
  markTicketWontFix,
  type ManagerTicketDecisionDeps,
  type MarkTicketDuplicateInput,
  type MarkTicketWontFixInput,
  type TicketDecisionSnapshot,
} from './managerTicketDecisionService';
import { isFinalTicketStatus } from './ticketStateMachine';

const NOW = new Date('2026-11-26T08:00:00.000Z');

const duplicateInput: MarkTicketDuplicateInput = {
  ticketId: 'ticket-1',
  managerId: 'manager-1',
  originalTicketId: 'ticket-2',
  reason: 'Same lift fault.',
};

const wontFixInput: MarkTicketWontFixInput = {
  ticketId: 'ticket-1',
  managerId: 'manager-1',
  reason: 'This is not a building repair.',
};

function setup() {
  const tickets = new Map<string, TicketDecisionSnapshot>([
    ['ticket-1', { id: 'ticket-1', status: 'Reported' as const, title: 'Lift is noisy' }],
    ['ticket-2', { id: 'ticket-2', status: 'In progress' as const, title: 'Lift repair' }],
  ]);
  const duplicateLinks = new Map<string, string>();
  const followers = new Map([
    ['ticket-1', ['resident-1', 'resident-2']],
    ['ticket-2', ['resident-2', 'resident-3']],
  ]);
  const findTicket = jest.fn(async (ticketId: string) => tickets.get(ticketId));
  const saveReportedDecisionIfUnchanged = jest.fn(
    async (input: {
      ticketId: string;
      status: 'Duplicate' | "Won't fix";
      duplicateOfId: string | null;
    }) => {
      const current = tickets.get(input.ticketId);
      if (!current || current.status !== 'Reported') return false;
      if (input.duplicateOfId) {
        const original = tickets.get(input.duplicateOfId);
        if (!original || isFinalTicketStatus(original.status)) return false;
      }

      tickets.set(input.ticketId, { ...current, status: input.status });
      if (input.duplicateOfId) {
        duplicateLinks.set(input.ticketId, input.duplicateOfId);
        followers.set(input.duplicateOfId, [
          ...new Set([
            ...(followers.get(input.duplicateOfId) ?? []),
            ...(followers.get(input.ticketId) ?? []),
          ]),
        ]);
        followers.delete(input.ticketId);
      }
      return true;
    },
  );
  const audit = jest.fn().mockResolvedValue(undefined);
  const activeManagerIds = jest.fn().mockResolvedValue([]);
  const followerAccountIds = jest.fn(async (ticketId: string) => [
    ...(followers.get(ticketId) ?? []),
  ]);
  const notify = jest.fn().mockResolvedValue(undefined);
  const deps: ManagerTicketDecisionDeps = {
    tickets: { findTicket, saveReportedDecisionIfUnchanged },
    audit,
    notices: {
      recipients: { activeManagerIds, followerAccountIds },
      notify,
    },
  };

  return {
    deps,
    tickets,
    duplicateLinks,
    followers,
    findTicket,
    saveReportedDecisionIfUnchanged,
    audit,
    followerAccountIds,
    notify,
  };
}

describe('BB-1303: mark a ticket Duplicate', () => {
  it('links an open original, transfers followers, records the reason, audits and notifies', async () => {
    const { deps, duplicateLinks, followers, saveReportedDecisionIfUnchanged, audit, notify } =
      setup();

    await expect(markTicketDuplicate(deps, duplicateInput, NOW)).resolves.toEqual({
      ticketId: 'ticket-1',
      status: 'Duplicate',
      duplicateOfId: 'ticket-2',
      reason: 'Same lift fault.',
    });

    expect(saveReportedDecisionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        status: 'Duplicate',
        duplicateOfId: 'ticket-2',
        change: expect.objectContaining({
          ticketId: 'ticket-1',
          fromStatus: 'Reported',
          toStatus: 'Duplicate',
          changedById: 'manager-1',
          reason: 'Same lift fault.',
          createdAt: NOW,
        }),
      }),
    );
    expect(followers.get('ticket-1')).toBeUndefined();
    expect(followers.get('ticket-2')).toEqual(['resident-2', 'resident-3', 'resident-1']);
    expect(duplicateLinks.get('ticket-1')).toBe('ticket-2');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'manager-1',
        action: 'ticket.duplicate',
        entityId: 'ticket-1',
        oldValues: { status: 'Reported', duplicateOfId: null },
        newValues: {
          status: 'Duplicate',
          duplicateOfId: 'ticket-2',
          reason: 'Same lift fault.',
        },
      }),
    );
    expect(notify.mock.calls.map(([notification]) => notification)).toEqual([
      {
        recipientId: 'resident-1',
        text: '"Lift is noisy" was marked as a duplicate of another ticket. Reason: Same lift fault.',
        link: '/resident/tickets',
      },
      {
        recipientId: 'resident-2',
        text: '"Lift is noisy" was marked as a duplicate of another ticket. Reason: Same lift fault.',
        link: '/resident/tickets',
      },
    ]);
  });

  it('requires an original ticket and refuses a self-link', async () => {
    const { deps, findTicket, saveReportedDecisionIfUnchanged } = setup();

    await expect(
      markTicketDuplicate(deps, { ...duplicateInput, originalTicketId: '  ' }, NOW),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Choose the original ticket.' });
    await expect(
      markTicketDuplicate(deps, { ...duplicateInput, originalTicketId: 'ticket-1' }, NOW),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Choose a different original ticket.',
    });
    expect(findTicket).not.toHaveBeenCalled();
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();
  });

  it('requires an existing, open original ticket', async () => {
    const { deps, findTicket, saveReportedDecisionIfUnchanged } = setup();
    findTicket.mockImplementation(async (ticketId: string) =>
      ticketId === 'ticket-1'
        ? { id: 'ticket-1', status: 'Reported', title: 'Lift is noisy' }
        : undefined,
    );

    await expect(markTicketDuplicate(deps, duplicateInput, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Original ticket not found.',
    });

    findTicket.mockImplementation(async (ticketId: string) =>
      ticketId === 'ticket-1'
        ? { id: 'ticket-1', status: 'Reported', title: 'Lift is noisy' }
        : { id: 'ticket-2', status: 'Closed', title: 'Lift repair' },
    );
    await expect(markTicketDuplicate(deps, duplicateInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Choose an open original ticket.',
    });
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();
  });

  it('accepts a Fixed original because it remains open until Closed', async () => {
    const { deps, findTicket, saveReportedDecisionIfUnchanged } = setup();
    findTicket.mockImplementation(async (ticketId: string) =>
      ticketId === 'ticket-1'
        ? { id: 'ticket-1', status: 'Reported', title: 'Lift is noisy' }
        : { id: 'ticket-2', status: 'Fixed', title: 'Lift repair' },
    );

    await expect(markTicketDuplicate(deps, duplicateInput, NOW)).resolves.toMatchObject({
      status: 'Duplicate',
      duplicateOfId: 'ticket-2',
    });
    expect(saveReportedDecisionIfUnchanged).toHaveBeenCalled();
  });

  it('requires a non-blank reason and trims it before saving', async () => {
    const { deps, saveReportedDecisionIfUnchanged } = setup();

    await expect(
      markTicketDuplicate(deps, { ...duplicateInput, reason: '   ' }, NOW),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Give a reason.' });
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();

    await markTicketDuplicate(deps, { ...duplicateInput, reason: '  Same lift fault.  ' }, NOW);
    expect(saveReportedDecisionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({ change: expect.objectContaining({ reason: 'Same lift fault.' }) }),
    );
  });
});

describe("BB-1303: mark a ticket Won't fix", () => {
  it('marks a Reported ticket, saves its reason and notifies its followers', async () => {
    const { deps, tickets, saveReportedDecisionIfUnchanged, audit, notify } = setup();

    await expect(markTicketWontFix(deps, wontFixInput, NOW)).resolves.toEqual({
      ticketId: 'ticket-1',
      status: "Won't fix",
      duplicateOfId: null,
      reason: 'This is not a building repair.',
    });

    expect(tickets.get('ticket-1')?.status).toBe("Won't fix");
    expect(saveReportedDecisionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        status: "Won't fix",
        duplicateOfId: null,
        change: expect.objectContaining({
          fromStatus: 'Reported',
          toStatus: "Won't fix",
          reason: 'This is not a building repair.',
          createdAt: NOW,
        }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ticket.wont_fix',
        newValues: {
          status: "Won't fix",
          duplicateOfId: null,
          reason: 'This is not a building repair.',
        },
      }),
    );
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'resident-1',
        text: '"Lift is noisy" won\'t be fixed. Reason: This is not a building repair.',
      }),
    );
  });

  it('requires a non-blank reason and trims it before saving', async () => {
    const { deps, saveReportedDecisionIfUnchanged } = setup();

    await expect(
      markTicketWontFix(deps, { ...wontFixInput, reason: ' ' }, NOW),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Give a reason.' });
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();

    await markTicketWontFix(deps, { ...wontFixInput, reason: '  Not a building repair.  ' }, NOW);
    expect(saveReportedDecisionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({ reason: 'Not a building repair.' }),
      }),
    );
  });

  it('rejects a missing ticket, an invalid state, and a concurrent decision', async () => {
    const { deps, findTicket, saveReportedDecisionIfUnchanged, audit, notify } = setup();

    findTicket.mockResolvedValue(undefined);
    await expect(markTicketWontFix(deps, wontFixInput, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();

    findTicket.mockResolvedValue({
      id: 'ticket-1',
      status: 'Assigned',
      title: 'Lift is noisy',
    });
    await expect(markTicketWontFix(deps, wontFixInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();

    findTicket.mockResolvedValue({
      id: 'ticket-1',
      status: 'Reported',
      title: 'Lift is noisy',
    });
    saveReportedDecisionIfUnchanged.mockResolvedValue(false);
    await expect(markTicketWontFix(deps, wontFixInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The ticket has changed. Refresh and try again.',
    });
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
