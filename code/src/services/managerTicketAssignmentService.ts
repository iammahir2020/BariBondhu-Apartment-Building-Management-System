/**
 * BB-1302: Manager assigns a reported fault ticket.
 *
 * Uses the shared ticket state machine.
 * Database writes must be atomic in the adapter.
 *
 * @author Jannatul Ferdus Nishi
 */

import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { NewTicketStatusChange, Ticket } from '@/models';
import { checkTicketTransition } from '@/services/ticketStateMachine';

export interface AssignTicketInput {
  ticketId: string;
  managerId: string;
  staffId: string;
  priority: Ticket['priority'];
  dueDate: string;
  instructions?: string | null;
}

export interface AssignmentTicketSnapshot {
  id: string;
  status: Ticket['status'];
}

export interface ManagerTicketAssignmentStore {
  findTicketForAssignment(ticketId: string): Promise<AssignmentTicketSnapshot | undefined>;

  isActiveMaintenanceStaff(staffId: string): Promise<boolean>;

  /**
   * Atomically:
   * 1. Update the ticket only if status is still Reported.
   * 2. Save its status history.
   *
   * Return false if the expected status has changed.
   */
  saveAssignmentIfReported(input: {
    ticketId: string;
    staffId: string;
    priority: Ticket['priority'];
    dueDate: string;
    instructions: string | null;
    change: NewTicketStatusChange;
  }): Promise<boolean>;
}

export interface ManagerTicketAssignmentDeps {
  tickets: ManagerTicketAssignmentStore;
}

export interface AssignmentResult {
  ticketId: string;
  status: 'Assigned';
  assigneeId: string;
  priority: Ticket['priority'];
  dueDate: string;
  instructions: string | null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Assigns a reported ticket to an active maintenance worker.
 *
 * Authorization of the signed-in manager belongs in the API
 * route (BB-1306). This service enforces assignment rules.
 */
export async function assignMaintenanceTicket(
  deps: ManagerTicketAssignmentDeps,
  input: AssignTicketInput,
  now: Date = new Date(),
): Promise<AssignmentResult> {
  const ticketId = input.ticketId?.trim();
  const managerId = input.managerId?.trim();
  const staffId = input.staffId?.trim();
  const dueDate = input.dueDate?.trim();

  if (!staffId || !dueDate) {
    throw new AppError('BAD_REQUEST', 'Choose a staff member and a due date');
  }

  if (!ticketId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Ticket and manager are required.');
  }

  if (!validDate(dueDate)) {
    throw new AppError('BAD_REQUEST', 'Check the due date.');
  }

  if (input.priority !== 'Normal' && input.priority !== 'High' && input.priority !== 'Urgent') {
    throw new AppError('BAD_REQUEST', 'Choose a valid priority.');
  }

  const ticket = await deps.tickets.findTicketForAssignment(ticketId);

  if (!ticket) {
    throw new AppError('NOT_FOUND', 'Ticket not found.');
  }

  // Do not modify Mahir's shared state machine.
  checkTicketTransition(ticket.status, 'Assigned', 'manager');

  const validStaff = await deps.tickets.isActiveMaintenanceStaff(staffId);

  if (!validStaff) {
    throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
  }

  const instructions = input.instructions?.trim() || null;

  const change: NewTicketStatusChange = {
    id: randomUUID(),
    ticketId,
    fromStatus: ticket.status,
    toStatus: 'Assigned',
    changedById: managerId,
    reason: null,
    createdAt: now,
  };

  const saved = await deps.tickets.saveAssignmentIfReported({
    ticketId,
    staffId,
    priority: input.priority,
    dueDate,
    instructions,
    change,
  });

  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  return {
    ticketId,
    status: 'Assigned',
    assigneeId: staffId,
    priority: input.priority,
    dueDate,
    instructions,
  };
}
