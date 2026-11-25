/**
 * What the Report a fault form offers: the common-area places that are switched on (BR-13) and the fault
 * categories. Residents only (`reportFault`).
 *
 * @author Mahir Al Kamal
 */
import { databaseTicketStore } from '@/lib/adapters/ticketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { reportFormOptions } from '@/services/ticketService';

/**
 * Lists the places and categories.
 * @param request - The request.
 * @returns 200 with `{ places, categories }`, or an error (401 signed out, 403 not a resident).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'reportFault');
    return Response.json(await reportFormOptions(databaseTicketStore(db)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
