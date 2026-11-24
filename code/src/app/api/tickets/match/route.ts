/**
 * The open common-area ticket a new report would duplicate (BR-13). The Report a fault page asks as soon as a place
 * and category are picked, so it can offer "Me too" before anything is typed. Residents only (`reportFault`).
 *
 * @author Mahir Al Kamal
 */
import { databaseTicketStore } from '@/lib/adapters/ticketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { parseCategory, parsePlaceId } from '@/lib/ticketInput';
import { toTicketView } from '@/lib/ticketResponse';
import { findOpenMatch } from '@/services/ticketService';

/**
 * Finds the open ticket for `?placeId=...&category=...`.
 * @param request - The request.
 * @returns 200 with `{ match, relation }` (the ticket and whether my household reported it, follows it or neither;
 * both null when there is none), or an error (400 bad place or category, 401, 403).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'reportFault');
    const query = new URL(request.url).searchParams;
    const placeId = parsePlaceId(query.get('placeId'));
    const category = parseCategory(query.get('category'));
    const found = await findOpenMatch(databaseTicketStore(db), user.actor, placeId, category);
    return Response.json({
      match: found ? toTicketView(found.ticket) : null,
      relation: found?.relation ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
