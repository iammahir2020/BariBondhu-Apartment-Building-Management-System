/**
 * API route for adding a work note to an assigned maintenance ticket (MNT-04, NFR-06).
 *
 * @author Adika Rahman
 */
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requireOwnTicket } from '@/lib/permissions';
import { readJsonObject, requireString } from '@/lib/parse';
import { requireTicketId } from '@/lib/ticketInput';
import { databaseAssignedTicketStore } from '@/lib/adapters/assignedTicketAdapters';
import { databaseWorkNoteStore } from '@/lib/adapters/workNoteAdapters';
import { addMyAssignedTicketWorkNote } from '@/services/workNoteService';

/**
 * Route context containing the ticket ID.
 */
type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Adds a work note to a ticket assigned to the signed-in maintenance worker.
 *
 * @param request - The incoming HTTP request.
 * @param context - Route parameters containing the ticket ID.
 * @returns The saved work note or an authorization/error response.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(request, 'workOnTickets');

    const { id } = await context.params;
    const ticketId = requireTicketId(id);

    const ticketStore = databaseAssignedTicketStore(db);
    const assigneeId = await ticketStore.assigneeIdFor(ticketId);

    requireOwnTicket(user, assigneeId);

    const body = await readJsonObject(request);
    const noteText = requireString(body, 'text', 'note');

    const note = await addMyAssignedTicketWorkNote(
      { workNotes: databaseWorkNoteStore(db) },
      ticketId,
      user.actor.id,
      noteText,
    );

    return Response.json({ note }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
