/**
 * "Me too": my household follows an open common-area ticket instead of reporting it again (RES-02, BR-13).
 * Residents only (`reportFault`). The ticket is another household's by design, so the service checks it is a common
 * area ticket that is still open rather than that it is ours.
 *
 * @author Mahir Al Kamal
 */
import { databaseTicketStore } from '@/lib/adapters/ticketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requireTicketId } from '@/lib/ticketInput';
import { databaseAuditWriter } from '@/services/auditService';
import { meToo } from '@/services/ticketService';

/**
 * Follows the ticket in the URL.
 * @param request - The request.
 * @param context - The route's `[id]`.
 * @returns 200 with `{ ticket, followerCount, alreadyFollowing }`, or an error (401, 403, 404, 409 inside a flat or
 * finished).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireRole(request, 'reportFault');
    const ticketId = requireTicketId((await context.params).id);
    const result = await meToo(
      { tickets: databaseTicketStore(db), audit: databaseAuditWriter(db) },
      user.actor,
      ticketId,
    );
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
