/**
 * Reopens a Fixed ticket as Assigned with a required reason (BM-07, BB-1304, BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { managerTicketReason, requireManagerTicketId } from '@/lib/managerTicketApi';
import { readJsonObject } from '@/lib/parse';
import { reopenFixedTicket } from '@/services/managerTicketCloseReopenService';

/**
 * Reopens a Fixed ticket from `{ reason }`.
 * @param request - Incoming request with the required reason.
 * @param context - Ticket ID from the route.
 * @returns The reopened ticket or a validation/state/authorization error.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'manageTickets');
    const { id } = await context.params;
    const ticketId = requireManagerTicketId(id);
    const body = await readJsonObject(request);
    const reason = managerTicketReason(body.reason);
    const dependencies = await databaseManagerTicketContext(db);
    const ticket = await reopenFixedTicket(dependencies, {
      ticketId,
      managerId: actor.id,
      reason,
    });
    return Response.json(ticket);
  } catch (error) {
    return toErrorResponse(error);
  }
}
