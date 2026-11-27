/**
 * Assigns a reported ticket to active maintenance staff (BM-06, BB-1302, BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import {
  isManagerTicketUuid,
  optionalManagerTicketText,
  requireManagerTicketId,
} from '@/lib/managerTicketApi';
import { readJsonObject } from '@/lib/parse';
import { ticketPriorityEnum } from '@/models/Ticket';
import { assignMaintenanceTicket } from '@/services/managerTicketAssignmentService';

/**
 * Assigns a ticket from `{ staffId, priority, dueDate, instructions? }`.
 * @param request - Incoming request with assignment details.
 * @param context - Ticket ID from the route.
 * @returns The assignment result or a validation/state/authorization error.
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
    if (staffId && !isManagerTicketUuid(staffId)) {
      throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
    }
    const priority = ticketPriorityEnum.enumValues.find((value) => value === body.priority);
    if (!priority) throw new AppError('BAD_REQUEST', 'Choose a valid priority.');
    const dueDate = typeof body.dueDate === 'string' ? body.dueDate : '';
    const instructions = optionalManagerTicketText(body.instructions, 'instructions');

    const dependencies = await databaseManagerTicketContext(db);
    const assignment = await assignMaintenanceTicket(dependencies, {
      ticketId,
      managerId: actor.id,
      staffId,
      priority,
      dueDate,
      instructions,
    });
    return Response.json(assignment);
  } catch (error) {
    return toErrorResponse(error);
  }
}
