/**
 * Business rules for listing a maintenance worker's assigned tickets, viewing details and changing ticket status.
 *
 * @author Adika Rahman
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { NewTicketStatusChange, Ticket } from '@/models';
import { checkTicketTransition } from '@/services/ticketStateMachine';

/** A safe ticket summary shown in the maintenance worker's assigned-ticket list. */
export interface AssignedTicketSummary {
  id: string;
  title: string | null;
  place: string;
  category: Ticket['category'];
  priority: Ticket['priority'];
  dueDate: string | null;
  status: Ticket['status'];
}

/** The safe details shown when a maintenance worker opens an assigned ticket. */
export interface AssignedTicketDetails extends AssignedTicketSummary {
  description: string;
  photoPath: string | null;
  homeTimes: string | null;
  instructions: string | null;
}

/** The status changes a maintenance worker can request. */
export type MaintenanceTicketStatus = 'In progress' | 'On hold' | 'Fixed';

/** The ticket reads and writes required by this service. */
export interface AssignedTicketStore {
  /**
   * Lists tickets assigned to a maintenance worker.
   *
   * @param assigneeId - The maintenance worker's profile ID.
   * @returns The worker's assigned ticket summaries.
   */
  listForAssignee(assigneeId: string): Promise<AssignedTicketSummary[]>;
  /**
   * Finds the current assignee of a ticket.
   *
   * @param ticketId - The ticket ID.
   * @returns The assignee's profile ID, or null when unassigned or not found.
   */
  assigneeIdFor(ticketId: string): Promise<string | null>;

  /**
   * Finds a ticket only when it is assigned to the given worker.
   *
   * @param ticketId - The ticket ID to find.
   * @param assigneeId - The maintenance worker's profile ID.
   * @returns The ticket details, or undefined when it is not assigned to the worker.
   */
  findForAssignee(ticketId: string, assigneeId: string): Promise<AssignedTicketDetails | undefined>;

  /**
   * Updates an assigned ticket and records its status change atomically.
   *
   * @param ticketId - The ticket ID.
   * @param assigneeId - The maintenance worker's profile ID.
   * @param expectedStatus - The status that must still be current.
   * @param change - The status history row to save.
   * @returns True when the ticket and history were saved; otherwise false.
   */
  updateStatusForAssignee(
    ticketId: string,
    assigneeId: string,
    expectedStatus: Ticket['status'],
    change: NewTicketStatusChange,
  ): Promise<boolean>;
}

/** Dependencies required by the assigned-ticket service. */
export interface AssignedTicketDeps {
  tickets: AssignedTicketStore;
}

/**
 * Lists only the tickets assigned to the given maintenance worker.
 * Urgent tickets appear first, followed by tickets with earlier due dates.
 *
 * @param deps - Ticket store dependency.
 * @param assigneeId - The maintenance worker's profile ID.
 * @returns The assigned tickets in display order, or an empty array.
 */
export async function listMyAssignedTickets(
  deps: Pick<AssignedTicketDeps, 'tickets'>,
  assigneeId: string,
): Promise<AssignedTicketSummary[]> {
  const tickets = await deps.tickets.listForAssignee(assigneeId);

  return [...tickets].sort((a, b) => {
    if (a.priority !== b.priority) {
      if (a.priority === 'Urgent') return -1;
      if (b.priority === 'Urgent') return 1;
    }

    if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
    if (b.dueDate === null) return -1;

    return a.dueDate.localeCompare(b.dueDate);
  });
}

/**
 * Gets the details of a ticket only if it is still assigned to the given worker.
 *
 * @param deps - Ticket store dependency.
 * @param ticketId - The ticket ID to open.
 * @param assigneeId - The maintenance worker's profile ID.
 * @returns The assigned ticket's safe details.
 * @throws AppError when the ticket is not assigned to this worker.
 */
export async function getMyAssignedTicket(
  deps: Pick<AssignedTicketDeps, 'tickets'>,
  ticketId: string,
  assigneeId: string,
): Promise<AssignedTicketDetails> {
  const ticket = await deps.tickets.findForAssignee(ticketId, assigneeId);

  if (!ticket) {
    throw new AppError('FORBIDDEN', 'This ticket is no longer assigned to you');
  }

  return ticket;
}

/**
 * Changes the status of a ticket assigned to the maintenance worker.
 * Every change is checked by the shared ticket state machine and saved with its history.
 *
 * @param deps - Ticket store dependency.
 * @param ticketId - The ticket ID to update.
 * @param assigneeId - The signed-in maintenance worker's profile ID.
 * @param toStatus - The requested status.
 * @param reason - Required when putting a ticket On hold.
 * @param now - The time of the status change.
 * @returns The ticket details with its updated status.
 * @throws AppError if the ticket is not assigned to the worker or the transition is not allowed.
 */
export async function changeMyAssignedTicketStatus(
  deps: Pick<AssignedTicketDeps, 'tickets'>,
  ticketId: string,
  assigneeId: string,
  toStatus: MaintenanceTicketStatus,
  reason?: string | null,
  now: Date = new Date(),
): Promise<AssignedTicketDetails> {
  const ticket = await deps.tickets.findForAssignee(ticketId, assigneeId);

  if (!ticket) {
    throw new AppError('FORBIDDEN', 'This ticket is no longer assigned to you');
  }

  checkTicketTransition(ticket.status, toStatus, 'maintenance', reason?.trim());

  const change: NewTicketStatusChange = {
    id: randomUUID(),
    ticketId,
    fromStatus: ticket.status,
    toStatus,
    changedById: assigneeId,
    reason: toStatus === 'On hold' ? (reason?.trim() ?? null) : null,
    createdAt: now,
  };

  const saved = await deps.tickets.updateStatusForAssignee(
    ticketId,
    assigneeId,
    ticket.status,
    change,
  );

  if (!saved) {
    const latest = await deps.tickets.findForAssignee(ticketId, assigneeId);

    if (!latest) {
      throw new AppError('FORBIDDEN', 'This ticket is no longer assigned to you');
    }

    checkTicketTransition(latest.status, toStatus, 'maintenance', reason?.trim());

    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  return { ...ticket, status: toStatus };
}
