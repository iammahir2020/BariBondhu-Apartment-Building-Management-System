/**
 * Marks a reported ticket Duplicate or Won't fix (BM-06, BB-1303, BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import {
  isManagerTicketUuid,
  managerTicketReason,
  requireManagerTicketId,
} from '@/lib/managerTicketApi';
import { readJsonObject } from '@/lib/parse';
import { markTicketDuplicate, markTicketWontFix } from '@/services/managerTicketDecisionService';

/**
 * Records a decision from `{ decision, reason, originalTicketId? }`.
 * @param request - Incoming request with decision details.
 * @param context - Ticket ID from the route.
 * @returns The saved decision or a validation/state/authorization error.
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

    if (body.decision === 'Duplicate') {
      const originalTicketId =
        typeof body.originalTicketId === 'string' ? body.originalTicketId.trim() : '';
      if (originalTicketId && !isManagerTicketUuid(originalTicketId)) {
        throw new AppError('BAD_REQUEST', 'Choose the original ticket.');
      }
      const dependencies = await databaseManagerTicketContext(db);
      const decision = await markTicketDuplicate(dependencies, {
        ticketId,
        managerId: actor.id,
        originalTicketId,
        reason,
      });
      return Response.json(decision);
    }

    if (body.decision === "Won't fix") {
      const dependencies = await databaseManagerTicketContext(db);
      const decision = await markTicketWontFix(dependencies, {
        ticketId,
        managerId: actor.id,
        reason,
      });
      return Response.json(decision);
    }

    throw new AppError('BAD_REQUEST', "Choose Duplicate or Won't fix.");
  } catch (error) {
    return toErrorResponse(error);
  }
}
