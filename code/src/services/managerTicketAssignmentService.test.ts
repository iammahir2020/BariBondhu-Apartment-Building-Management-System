/**
 * BB-1302: Manager ticket assignment unit tests.
 *
 * Covers assignment rules, Dhaka due dates, audit logging,
 * notifications, and concurrent assignment conflicts.
 *
 * @author Jannatul Ferdus Nishi
 */

import {
  assignMaintenanceTicket,
  type AssignTicketInput,
  type ManagerTicketAssignmentDeps,
} from './managerTicketAssignmentService';

const NOW = new Date('2026-11-26T08:00:00.000Z');

const validInput: AssignTicketInput = {
  ticketId: 'ticket-1',
  managerId: 'manager-1',
  staffId: 'staff-1',
  priority: 'Normal',
  dueDate: '2026-12-05',
  instructions: 'Check the water pipe.',
};

function setup() {
  const findTicketForAssignment = jest.fn().mockResolvedValue({
    id: 'ticket-1',
    status: 'Reported',
    title: 'Water pipe leak',
  });

  const isActiveMaintenanceStaff = jest.fn().mockResolvedValue(true);

  const saveAssignmentIfReported = jest.fn().mockResolvedValue(true);

  const audit = jest.fn().mockResolvedValue(undefined);

  const activeManagerIds = jest.fn().mockResolvedValue([]);

  const followerAccountIds = jest.fn().mockResolvedValue(['reporter-1', 'follower-1']);

  const notify = jest.fn().mockResolvedValue(undefined);

  const deps: ManagerTicketAssignmentDeps = {
    tickets: {
      findTicketForAssignment,
      isActiveMaintenanceStaff,
      saveAssignmentIfReported,
    },

    audit,

    notices: {
      recipients: {
        activeManagerIds,
        followerAccountIds,
      },
      notify,
    },
  };

  return {
    deps,
    findTicketForAssignment,
    isActiveMaintenanceStaff,
    saveAssignmentIfReported,
    audit,
    activeManagerIds,
    followerAccountIds,
    notify,
  };
}

describe('BB-1302: Assign maintenance ticket', () => {
  it('assigns a reported ticket to an active worker', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    const result = await assignMaintenanceTicket(deps, validInput, NOW);

    expect(result).toEqual({
      ticketId: 'ticket-1',
      status: 'Assigned',
      assigneeId: 'staff-1',
      priority: 'Normal',
      dueDate: '2026-12-05',
      instructions: 'Check the water pipe.',
    });

    expect(saveAssignmentIfReported).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        staffId: 'staff-1',
        priority: 'Normal',
        dueDate: '2026-12-05',
        change: expect.objectContaining({
          ticketId: 'ticket-1',
          fromStatus: 'Reported',
          toStatus: 'Assigned',
          changedById: 'manager-1',
          createdAt: NOW,
        }),
      }),
    );
  });

  it('supports urgent priority', async () => {
    const { deps } = setup();

    const result = await assignMaintenanceTicket(
      deps,
      {
        ...validInput,
        priority: 'Urgent',
      },
      NOW,
    );

    expect(result.priority).toBe('Urgent');
  });

  it('requires a staff member', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    await expect(
      assignMaintenanceTicket(deps, { ...validInput, staffId: '' }, NOW),
    ).rejects.toThrow('Choose a staff member and a due date');

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('requires a due date', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    await expect(
      assignMaintenanceTicket(deps, { ...validInput, dueDate: '' }, NOW),
    ).rejects.toThrow('Choose a staff member and a due date');

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('rejects an invalid calendar date', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    await expect(
      assignMaintenanceTicket(deps, { ...validInput, dueDate: '2026-02-31' }, NOW),
    ).rejects.toThrow('Check the due date.');

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('rejects an inactive maintenance worker', async () => {
    const { deps, isActiveMaintenanceStaff, saveAssignmentIfReported } = setup();

    isActiveMaintenanceStaff.mockResolvedValue(false);

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toThrow(
      'Choose an active maintenance staff member.',
    );

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('rejects assigning an already assigned ticket', async () => {
    const { deps, findTicketForAssignment, saveAssignmentIfReported } = setup();

    findTicketForAssignment.mockResolvedValue({
      id: 'ticket-1',
      status: 'Assigned',
      title: 'Water pipe leak',
    });

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('rejects a ticket that does not exist', async () => {
    const { deps, findTicketForAssignment, saveAssignmentIfReported } = setup();

    findTicketForAssignment.mockResolvedValue(undefined);

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('detects a concurrent assignment conflict', async () => {
    const { deps, saveAssignmentIfReported, audit, notify, followerAccountIds } = setup();

    saveAssignmentIfReported.mockResolvedValue(false);

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toThrow(
      'The ticket has changed. Refresh and try again.',
    );

    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(followerAccountIds).not.toHaveBeenCalled();
  });

  it('trims instructions before saving', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    await assignMaintenanceTicket(
      deps,
      {
        ...validInput,
        instructions: '  Repair the lift  ',
      },
      NOW,
    );

    expect(saveAssignmentIfReported).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: 'Repair the lift',
      }),
    );
  });

  it('allows empty optional instructions', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    await assignMaintenanceTicket(
      deps,
      {
        ...validInput,
        instructions: '   ',
      },
      NOW,
    );

    expect(saveAssignmentIfReported).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: null,
      }),
    );
  });

  // Reviewer: Reject past dates using Asia/Dhaka.

  it('rejects yesterday as the due date in Asia/Dhaka', async () => {
    const { deps, saveAssignmentIfReported, audit } = setup();

    await expect(
      assignMaintenanceTicket(
        deps,
        {
          ...validInput,
          dueDate: '2026-11-25',
        },
        NOW,
      ),
    ).rejects.toThrow('Check the due date.');

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('allows today as the due date in Asia/Dhaka', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    const result = await assignMaintenanceTicket(
      deps,
      {
        ...validInput,
        dueDate: '2026-11-26',
      },
      NOW,
    );

    expect(result.dueDate).toBe('2026-11-26');
    expect(saveAssignmentIfReported).toHaveBeenCalledTimes(1);
  });

  it('uses Dhaka midnight rather than UTC midnight', async () => {
    const { deps, saveAssignmentIfReported } = setup();

    // 25 Nov 18:05 UTC = 26 Nov 00:05 in Dhaka.
    const afterDhakaMidnight = new Date('2026-11-25T18:05:00.000Z');

    await expect(
      assignMaintenanceTicket(
        deps,
        {
          ...validInput,
          dueDate: '2026-11-25',
        },
        afterDhakaMidnight,
      ),
    ).rejects.toThrow('Check the due date.');

    expect(saveAssignmentIfReported).not.toHaveBeenCalled();
  });

  it('accepts the local date before Dhaka midnight', async () => {
    const { deps } = setup();

    // 25 Nov 17:55 UTC = 25 Nov 23:55 in Dhaka.
    const beforeDhakaMidnight = new Date('2026-11-25T17:55:00.000Z');

    const result = await assignMaintenanceTicket(
      deps,
      {
        ...validInput,
        dueDate: '2026-11-25',
      },
      beforeDhakaMidnight,
    );

    expect(result.status).toBe('Assigned');
  });

  // Reviewer: Audit logging (NFR-27).

  it('creates a ticket.assign audit entry', async () => {
    const { deps, audit } = setup();

    await assignMaintenanceTicket(deps, validInput, NOW);

    expect(audit).toHaveBeenCalledTimes(1);

    expect(audit).toHaveBeenCalledWith({
      actorId: 'manager-1',
      action: 'ticket.assign',
      entityType: 'tickets',
      entityId: 'ticket-1',
      oldValues: {
        status: 'Reported',
      },
      newValues: {
        status: 'Assigned',
        assigneeId: 'staff-1',
        priority: 'Normal',
        dueDate: '2026-12-05',
      },
    });
  });

  // Reviewer: Notifications (BM-06).

  it('notifies the worker, reporter and followers', async () => {
    const { deps, followerAccountIds, notify } = setup();

    await assignMaintenanceTicket(deps, validInput, NOW);

    expect(followerAccountIds).toHaveBeenCalledWith('ticket-1');

    expect(notify).toHaveBeenCalledWith({
      recipientId: 'staff-1',
      text: 'New ticket assigned to you: Water pipe leak',
      link: '/maintenance',
    });

    expect(notify).toHaveBeenCalledWith({
      recipientId: 'reporter-1',
      text: '"Water pipe leak" has been assigned to a staff member.',
      link: '/resident/tickets',
    });

    expect(notify).toHaveBeenCalledWith({
      recipientId: 'follower-1',
      text: '"Water pipe leak" has been assigned to a staff member.',
      link: '/resident/tickets',
    });

    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('sends no notices or audit record when assignment fails', async () => {
    const { deps, saveAssignmentIfReported, audit, notify, followerAccountIds } = setup();

    saveAssignmentIfReported.mockResolvedValue(false);

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(followerAccountIds).not.toHaveBeenCalled();
  });

  it('does not undo assignment when notification fails', async () => {
    const { deps, saveAssignmentIfReported, audit, notify } = setup();

    notify.mockRejectedValue(new Error('Notification unavailable'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const result = await assignMaintenanceTicket(deps, validInput, NOW);

      expect(result.status).toBe('Assigned');
      expect(result.assigneeId).toBe('staff-1');

      expect(saveAssignmentIfReported).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledTimes(1);

      expect(notify).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
