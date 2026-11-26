/**
 * Returns a short-lived URL for a ticket photo after manager and building-scope checks (BM-06, NFR-14).
 *
 * @author Jannatul Ferdus Nishi
 */
import { managerTicketPhotoStore } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { requireManagerTicketId } from '@/lib/managerTicketApi';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Creates a time-limited URL for an in-scope ticket photo.
 * @param request - Incoming request.
 * @param context - Ticket ID from the route.
 * @returns 200 with `{ url }`, 404 when no in-scope photo exists, or an authorization/storage error.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole(request, 'manageTickets');
    const { id } = await context.params;
    const ticketId = requireManagerTicketId(id);
    const url = await managerTicketPhotoStore(db, getSupabaseAdmin()).signedUrlForTicket(ticketId);
    if (!url) throw new AppError('NOT_FOUND', 'Ticket photo not found.');
    return Response.json({ url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
