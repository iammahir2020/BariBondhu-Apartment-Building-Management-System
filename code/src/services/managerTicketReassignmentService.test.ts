/**
 * BB-1308: Manager ticket reassignment service tests.
 *
 * @author Jannatul Ferdous Nishi
 */
import {
  reassignMaintenanceTicket,
  type ManagerTicketReassignmentDeps,
  type TicketReassignmentSnapshot,
} from './managerTicketReassignmentService';

const NOW = new Date('2026-11-27T00:00:00.000Z');
const INPUT = { ticketId: 'ticket-1', managerId: 'manager-1', staffId: 'staff-2' };

function setup(
  status: TicketReassignmentSnapshot['status'] = 'In progress',
  assigneeId: string | null = 'staff-1',
) {
  const ticket: TicketReassignmentSnapshot = {
    id: 'ticket-1',
    status,
    title: 'Water pipe leak',
    assigneeId,
  };
  const findTicketForReassignment = jest.fn().mockResolvedValue(ticket);
  const isActiveMaintenanceStaff = jest.fn().mockResolvedValue(true);
  const saveReassignmentIfUnchanged = jest.fn().mockResolvedValue(true);
  const audit = jest.fn().mockResolvedValue(undefined);
  const followerAccountIds = jest.fn().mockResolvedValue(['resident-1', 'resident-1']);
  const notify = jest.fn().mockResolvedValue(undefined);
  const deps: ManagerTicketReassignmentDeps = {
    tickets: {
      findTicketForReassignment,
      isActiveMaintenanceStaff,
      saveReassignmentIfUnchanged,
    },
    audit,
    notices: {
      recipients: {
        activeManagerIds: jest.fn().mockResolvedValue([]),
        followerAccountIds,
      },
      notify,
    },
  };
  return {
    deps,
    findTicketForReassignment,
    isActiveMaintenanceStaff,
    saveReassignmentIfUnchanged,
    audit,
    followerAccountIds,
    notify,
  };
}

describe('BB-1308: reassign an open maintenance ticket', () => {
  it.each(['Assigned', 'In progress', 'On hold'] as const)(
    'changes the assignee and preserves the %s status',
    async (status) => {
      const { deps, saveReassignmentIfUnchanged, audit, followerAccountIds, notify } =
        setup(status);

      await expect(reassignMaintenanceTicket(deps, INPUT, NOW)).resolves.toEqual({
        ticketId: 'ticket-1',
        status,
        assigneeId: 'staff-2',
      });

      expect(saveReassignmentIfUnchanged).toHaveBeenCalledWith({
        ticketId: 'ticket-1',
        status,
        previousAssigneeId: 'staff-1',
        staffId: 'staff-2',
        updatedAt: NOW,
      });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'manager-1',
          action: 'ticket.reassign',
          entityId: 'ticket-1',
          oldValues: { status, assigneeId: 'staff-1' },
          newValues: { status, assigneeId: 'staff-2' },
        }),
      );
      expect(followerAccountIds).toHaveBeenCalledWith('ticket-1');
      expect(notify.mock.calls.map(([notification]) => notification)).toEqual([
        {
          recipientId: 'staff-2',
          text: 'Ticket reassigned to you: Water pipe leak',
          link: '/maintenance',
        },
        {
          recipientId: 'staff-1',
          text: 'Ticket reassigned from you: Water pipe leak',
          link: '/maintenance',
        },
        {
          recipientId: 'resident-1',
          text: 'The maintenance worker for "Water pipe leak" has changed.',
          link: '/resident/tickets',
        },
      ]);
    },
  );

  it.each(['Reported', 'Fixed', 'Closed', 'Cancelled', 'Duplicate', "Won't fix"] as const)(
    'refuses a %s ticket',
    async (status) => {
      const { deps, saveReassignmentIfUnchanged, audit } = setup(status);

      await expect(reassignMaintenanceTicket(deps, INPUT, NOW)).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      expect(saveReassignmentIfUnchanged).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it('reports a missing ticket', async () => {
    const { deps, findTicketForReassignment, saveReassignmentIfUnchanged } = setup();
    findTicketForReassignment.mockResolvedValueOnce(undefined);

    await expect(reassignMaintenanceTicket(deps, INPUT, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ticket not found.',
    });
    expect(saveReassignmentIfUnchanged).not.toHaveBeenCalled();
  });

  it('rejects blank identifiers before reading the ticket', async () => {
    const { deps, findTicketForReassignment } = setup();

    await expect(
      reassignMaintenanceTicket(deps, { ...INPUT, managerId: ' ' }, NOW),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(findTicketForReassignment).not.toHaveBeenCalled();
  });

  it('requires an existing assignee and a different active worker', async () => {
    const unassigned = setup('Assigned', null);
    await expect(reassignMaintenanceTicket(unassigned.deps, INPUT, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const sameWorker = setup('Assigned', 'staff-2');
    await expect(reassignMaintenanceTicket(sameWorker.deps, INPUT, NOW)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(sameWorker.isActiveMaintenanceStaff).not.toHaveBeenCalled();

    const inactiveWorker = setup();
    inactiveWorker.isActiveMaintenanceStaff.mockResolvedValueOnce(false);
    await expect(reassignMaintenanceTicket(inactiveWorker.deps, INPUT, NOW)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(inactiveWorker.saveReassignmentIfUnchanged).not.toHaveBeenCalled();
  });

  it('reports a concurrent ticket change without auditing or notifying', async () => {
    const { deps, saveReassignmentIfUnchanged, audit, notify } = setup();
    saveReassignmentIfUnchanged.mockResolvedValueOnce(false);

    await expect(reassignMaintenanceTicket(deps, INPUT, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The ticket has changed. Refresh and try again.',
    });
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not fail the reassignment when follower lookup for notifications fails', async () => {
    const { deps, followerAccountIds } = setup();
    const error = new Error('Notification recipients unavailable');
    followerAccountIds.mockRejectedValueOnce(error);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(reassignMaintenanceTicket(deps, INPUT, NOW)).resolves.toMatchObject({
      assigneeId: 'staff-2',
    });
    expect(logged).toHaveBeenCalledWith('Could not send a ticket reassignment notification', error);
    logged.mockRestore();
  });
});
