/**
 * BB-1302: Manager ticket assignment unit tests.
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
  });

  const isActiveMaintenanceStaff = jest.fn().mockResolvedValue(true);

  const saveAssignmentIfReported = jest.fn().mockResolvedValue(true);

  const deps: ManagerTicketAssignmentDeps = {
    tickets: {
      findTicketForAssignment,
      isActiveMaintenanceStaff,
      saveAssignmentIfReported,
    },
  };

  return {
    deps,
    findTicketForAssignment,
    isActiveMaintenanceStaff,
    saveAssignmentIfReported,
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

    const result = await assignMaintenanceTicket(deps, { ...validInput, priority: 'Urgent' }, NOW);

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
    const { deps, saveAssignmentIfReported } = setup();

    saveAssignmentIfReported.mockResolvedValue(false);

    await expect(assignMaintenanceTicket(deps, validInput, NOW)).rejects.toThrow(
      'The ticket has changed. Refresh and try again.',
    );
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

    await assignMaintenanceTicket(deps, { ...validInput, instructions: '   ' }, NOW);

    expect(saveAssignmentIfReported).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: null,
      }),
    );
  });
});
