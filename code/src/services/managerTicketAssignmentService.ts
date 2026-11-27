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
import type { AuditWriter } from '@/services/auditService';

import { notifyTicketStatusChange, type TicketNoticeDeps } from '@/services/ticketNotifications';

import { checkTicketTransition } from '@/services/ticketStateMachine';

/** Input required to assign a ticket to a maintenance worker. */
export interface AssignTicketInput {
  ticketId: string;
  managerId: string;
  staffId: string;
  priority: Ticket['priority'];
  dueDate: string;
  instructions?: string | null;
}

/** Current ticket details needed to validate and notify an assignment. */
export interface AssignmentTicketSnapshot {
  id: string;
  status: Ticket['status'];
  title: Ticket['title'];
}

/** Database operations required for manager ticket assignment. */
export interface ManagerTicketAssignmentStore {
  /** Finds the ticket's current status and title before assignment. */
  findTicketForAssignment(ticketId: string): Promise<AssignmentTicketSnapshot | undefined>;

  /** Checks whether a profile belongs to an active maintenance worker. */
  isActiveMaintenanceStaff(staffId: string): Promise<boolean>;

  /**
   * Atomically:
   * 1. Updates the ticket only when its status is still Reported.
   * 2. Saves its status history.
   *
   * @returns False if the ticket's expected status has changed.
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

/** Dependencies used by the manager ticket assignment service. */
export interface ManagerTicketAssignmentDeps {
  /** Database operations for assigning tickets. */
  tickets: ManagerTicketAssignmentStore;

  /** Writes audit entries for assignment actions. */
  audit: AuditWriter;

  /** Notification dependencies for workers and ticket followers. */
  notices: TicketNoticeDeps;
}

/** Assignment details returned after a successful update. */
export interface AssignmentResult {
  ticketId: string;
  status: 'Assigned';
  assigneeId: string;
  priority: Ticket['priority'];
  dueDate: string;
  instructions: string | null;
}

/**
 * Validates a date in YYYY-MM-DD format.
 *
 * @param value - Date string to validate.
 * @returns True when the date is valid.
 */
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Gets today's calendar date in Bangladesh.
 *
 * @param now - Current instant.
 * @returns Today's date in Asia/Dhaka as YYYY-MM-DD.
 */
function dhakaToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const getPart = (type: string): string => {
    return parts.find((part) => part.type === type)?.value ?? '';
  };

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  return `${year}-${month}-${day}`;
}

/**
 * Assigns a reported ticket to an active maintenance worker.
 *
 * The shared state machine validates Reported -> Assigned.
 * The database adapter prevents concurrent assignments.
 * Audit and notifications happen only after a successful save.
 *
 * Authorization of the signed-in manager belongs in the API
 * route (BB-1306). This service enforces assignment rules.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Assignment details.
 * @param now - Current time, injectable for tests.
 * @returns Details of the completed assignment.
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

  // BM-06: Staff member and due date are required.
  if (!staffId || !dueDate) {
    throw new AppError('BAD_REQUEST', 'Choose a staff member and a due date');
  }

  // These values normally come from the authenticated API route.
  if (!ticketId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Invalid assignment request.');
  }

  // Validate the date and reject past dates in Asia/Dhaka.
  if (!validDate(dueDate) || dueDate < dhakaToday(now)) {
    throw new AppError('BAD_REQUEST', 'Check the due date.');
  }

  // Only valid ticket priorities are accepted.
  if (input.priority !== 'Normal' && input.priority !== 'High' && input.priority !== 'Urgent') {
    throw new AppError('BAD_REQUEST', 'Choose a valid priority.');
  }

  // Get the current ticket.
  const ticket = await deps.tickets.findTicketForAssignment(ticketId);

  if (!ticket) {
    throw new AppError('NOT_FOUND', 'Ticket not found.');
  }

  // Use Mahir's shared state machine without modifying it.
  checkTicketTransition(ticket.status, 'Assigned', 'manager');

  // Only active maintenance staff may receive assignments.
  const validStaff = await deps.tickets.isActiveMaintenanceStaff(staffId);

  if (!validStaff) {
    throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
  }

  const instructions = input.instructions?.trim() || null;

  // Prepare the ticket status history entry.
  const change: NewTicketStatusChange = {
    id: randomUUID(),
    ticketId,
    fromStatus: ticket.status,
    toStatus: 'Assigned',
    changedById: managerId,
    reason: null,
    createdAt: now,
  };

  // The adapter must atomically check status = Reported,
  // update the ticket and save the history entry.
  const saved = await deps.tickets.saveAssignmentIfReported({
    ticketId,
    staffId,
    priority: input.priority,
    dueDate,
    instructions,
    change,
  });

  // Two managers must not successfully assign the same ticket.
  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  // NFR-27: Record the successful assignment.
  await deps.audit({
    actorId: managerId,
    action: 'ticket.assign',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: {
      status: ticket.status,
    },
    newValues: {
      status: 'Assigned',
      assigneeId: staffId,
      priority: input.priority,
      dueDate,
    },
  });

  // Use a fallback title for tickets reported without a title.
  const ticketForNotification = {
    id: ticket.id,
    title: ticket.title?.trim() || 'Untitled ticket',
  };

  // BM-06: Notify followers (including the reporter) and worker.
  // Notifications happen only after a successful save.
  const notificationResults = await Promise.allSettled([
    notifyTicketStatusChange(deps.notices, ticketForNotification, {
      from: ticket.status,
      to: 'Assigned',
      changedById: managerId,
      reason: null,
    }),

    deps.notices.notify({
      recipientId: staffId,
      text: `New ticket assigned to you: ${ticketForNotification.title}`,
      link: '/maintenance',
    }),
  ]);

  // A failed notification must not undo the saved assignment.
  for (const result of notificationResults) {
    if (result.status === 'rejected') {
      console.error('Could not send an assignment notification', result.reason);
    }
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
