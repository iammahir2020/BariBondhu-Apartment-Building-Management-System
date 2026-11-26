/**
 * Closes a Fixed ticket (BM-07, BB-1304, BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requireManagerTicketId } from '@/lib/managerTicketApi';
import { closeFixedTicket } from '@/services/managerTicketCloseReopenService';

/**
 * Closes a Fixed ticket.
 * @param request - Incoming request.
 * @param context - Ticket ID from the route.
 * @returns The closed ticket or a state/authorization error.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'manageTickets');
    const { id } = await context.params;
    const ticketId = requireManagerTicketId(id);
    const dependencies = await databaseManagerTicketContext(db);
    const ticket = await closeFixedTicket(dependencies, { ticketId, managerId: actor.id });
    return Response.json(ticket);
  } catch (error) {
    return toErrorResponse(error);
  }
}
