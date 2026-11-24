/**
 * Cancels my household's Reported ticket, or stops following it when other households follow it (RES-02).
 * Residents only, for their own household's tickets (`reportFault`, Own): the service refuses a ticket my household
 * neither reported nor follows.
 *
 * @author Mahir Al Kamal
 */
import { databaseTicketStore } from '@/lib/adapters/ticketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requireTicketId } from '@/lib/ticketInput';
import { toTicketView } from '@/lib/ticketResponse';
import { databaseAuditWriter } from '@/services/auditService';
import { cancelTicket } from '@/services/ticketService';

/**
 * Cancels the ticket in the URL.
 * @param request - The request.
 * @param context - The route's `[id]`.
 * @returns 200 with `{ outcome: 'cancelled' | 'unfollowed', ticket }`, or an error (401, 403 not ours, 404, 409 no
 * longer Reported).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireRole(request, 'reportFault');
    const ticketId = requireTicketId((await context.params).id);
    const result = await cancelTicket(
      { tickets: databaseTicketStore(db), audit: databaseAuditWriter(db) },
      user.actor,
      ticketId,
    );
    return Response.json({ ...result, ticket: toTicketView(result.ticket) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
