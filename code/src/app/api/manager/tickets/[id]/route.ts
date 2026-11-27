/**
 * Returns one in-scope ticket with its BM-07 status history and work notes.
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requireManagerTicketId } from '@/lib/managerTicketApi';
import { getManagerTicketDetails } from '@/services/managerTicketQueryService';

/**
 * Reads a manager-visible ticket.
 * @param request - Incoming request.
 * @param context - Ticket ID from the route.
 * @returns 200 with `{ ticket }`, 404 when missing or outside this building, or an authorization error.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole(request, 'manageTickets');
    const { id } = await context.params;
    const ticketId = requireManagerTicketId(id);
    const dependencies = await databaseManagerTicketContext(db);
    const ticket = await getManagerTicketDetails(dependencies.tickets, ticketId);
    return Response.json({ ticket });
  } catch (error) {
    return toErrorResponse(error);
  }
}
