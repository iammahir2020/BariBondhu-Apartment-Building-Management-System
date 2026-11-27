/**
 * Reassigns an open ticket to another active maintenance worker (BM-02, BM-06, BB-1308).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { isManagerTicketUuid, requireManagerTicketId } from '@/lib/managerTicketApi';
import { readJsonObject } from '@/lib/parse';
import { reassignMaintenanceTicket } from '@/services/managerTicketReassignmentService';

/**
 * Reassigns a ticket from `{ staffId }`, preserving its current work state.
 * @param request - Incoming request with the new maintenance worker.
 * @param context - Ticket ID from the route.
 * @returns The new assignee and unchanged ticket status, or a validation/state/authorization error.
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
    const staffId = typeof body.staffId === 'string' ? body.staffId.trim() : '';
    if (!isManagerTicketUuid(staffId)) {
      throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
    }

    const dependencies = await databaseManagerTicketContext(db);
    const result = await reassignMaintenanceTicket(dependencies, {
      ticketId,
      managerId: actor.id,
      staffId,
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
