/**
 * A resident's fault tickets (RES-02): list my household's tickets, and report a new fault. Residents only, for
 * their own household (`reportFault`, Own): the service takes the household from the signed-in account, never from
 * the request.
 *
 * @author Mahir Al Kamal
 */
import { databaseTicketStore, ticketDeps } from '@/lib/adapters/ticketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { parseReportForm } from '@/lib/ticketInput';
import { listMyTickets, reportFault } from '@/services/ticketService';

/**
 * My tickets: the ones my household reported or follows, newest first.
 * @param request - The request.
 * @returns 200 with `{ tickets }`, or an error (401 signed out, 403 not a resident).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'reportFault');
    const tickets = await listMyTickets(databaseTicketStore(db), user.actor);
    return Response.json({ tickets });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Reports a fault from the Report a fault form (`multipart/form-data`: where, placeId, category, title,
 * description, homeTimes, photo, emergency).
 * @param request - The request.
 * @returns 201 with `{ ticket }` for a new ticket; 200 with `{ match }` when an open common-area ticket already
 * covers it, for "Me too" (BR-13); or an error (400 rule broken, 401 signed out, 403 not a resident).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'reportFault');
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError('BAD_REQUEST', 'The request is not a form.');
    }
    const input = await parseReportForm(form);
    const result = await reportFault(ticketDeps(db, getSupabaseAdmin()), user.actor, input);
    return result.kind === 'created'
      ? Response.json({ ticket: result.ticket }, { status: 201 })
      : Response.json({ match: result.ticket });
  } catch (error) {
    return toErrorResponse(error);
  }
}
