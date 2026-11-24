/**
 * Business rules for listing a maintenance worker's assigned tickets and viewing their details.
 *
 * @author Adika Rahman
 */
import { AppError } from '@/lib/errors';
import type { Ticket } from '@/models';

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

/** The ticket reads required by this service. */
/** The ticket reads required by this service. */
export interface AssignedTicketStore {
  /**
   * Lists tickets assigned to a maintenance worker.
   *
   * @param assigneeId - The maintenance worker's profile ID.
   * @returns The worker's assigned ticket summaries.
   */
  listForAssignee(assigneeId: string): Promise<AssignedTicketSummary[]>;

  /**
   * Finds a ticket only when it is assigned to the given worker.
   *
   * @param ticketId - The ticket ID to find.
   * @param assigneeId - The maintenance worker's profile ID.
   * @returns The ticket details, or undefined when it is not assigned to the worker.
   */
  findForAssignee(ticketId: string, assigneeId: string): Promise<AssignedTicketDetails | undefined>;
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
 * Gets the details of a ticket only if it is still assigned to the given maintenance worker.
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
