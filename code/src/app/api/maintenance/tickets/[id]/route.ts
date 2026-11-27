/**
 * API routes for viewing and updating an assigned maintenance ticket.
 *
 * @author Adika Rahman
 */
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { requireOwnTicket } from '@/lib/permissions';
import { readJsonObject, requireString } from '@/lib/parse';
import { requireTicketId } from '@/lib/ticketInput';
import { databaseAssignedTicketStore } from '@/lib/adapters/assignedTicketAdapters';
import {
  changeMyAssignedTicketStatus,
  getMyAssignedTicket,
  type MaintenanceTicketStatus,
} from '@/services/assignedTicketService';

/**
 * Route context containing the ticket ID.
 */
type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Returns details of a ticket assigned to the signed-in maintenance worker.
 *
 * @param request - The incoming HTTP request.
 * @param context - Route parameters containing the ticket ID.
 * @returns The ticket details or an authorization/error response.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(request, 'workOnTickets');

    const { id } = await context.params;
    const ticketId = requireTicketId(id);

    const store = databaseAssignedTicketStore(db);
    const assigneeId = await store.assigneeIdFor(ticketId);

    requireOwnTicket(user, assigneeId);

    const ticket = await getMyAssignedTicket({ tickets: store }, ticketId, user.actor.id);

    return Response.json({ ticket });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Updates the status of a ticket assigned to the signed-in maintenance worker.
 *
 * @param request - The incoming HTTP request.
 * @param context - Route parameters containing the ticket ID.
 * @returns The updated ticket or an authorization/error response.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(request, 'workOnTickets');

    const { id } = await context.params;
    const ticketId = requireTicketId(id);

    const store = databaseAssignedTicketStore(db);
    const assigneeId = await store.assigneeIdFor(ticketId);

    requireOwnTicket(user, assigneeId);

    const body = await readJsonObject(request);
    const rawStatus = requireString(body, 'status', 'status');

    const allowedStatuses: MaintenanceTicketStatus[] = ['In progress', 'On hold', 'Fixed'];

    if (!allowedStatuses.includes(rawStatus as MaintenanceTicketStatus)) {
      throw new AppError('BAD_REQUEST', 'Invalid maintenance ticket status.');
    }

    const reason = typeof body.reason === 'string' ? body.reason : null;

    const ticket = await changeMyAssignedTicketStatus(
      { tickets: store },
      ticketId,
      user.actor.id,
      rawStatus as MaintenanceTicketStatus,
      reason,
    );

    return Response.json({ ticket });
  } catch (error) {
    return toErrorResponse(error);
  }
}
