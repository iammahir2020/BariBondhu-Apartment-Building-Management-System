/**
 * API route for listing the signed-in maintenance worker's assigned tickets (MNT-01, NFR-06).
 *
 * @author Adika Rahman
 */
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { databaseAssignedTicketStore } from '@/lib/adapters/assignedTicketAdapters';
import { listMyAssignedTickets } from '@/services/assignedTicketService';

/**
 * Lists tickets assigned to the signed-in maintenance worker.
 *
 * @param request - The incoming HTTP request.
 * @returns The worker's assigned tickets, or an authorization/error response.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'workOnTickets');

    const tickets = await listMyAssignedTickets(
      { tickets: databaseAssignedTicketStore(db) },
      user.actor.id,
    );

    return Response.json({ tickets });
  } catch (error) {
    return toErrorResponse(error);
  }
}
