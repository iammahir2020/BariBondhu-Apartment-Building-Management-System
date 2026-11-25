/**
 * The building's emergency numbers (SG-06, BM-10, BB-2005), for every signed-in role that may see them
 * (`viewEmergencyNumbers`). 999 isn't here: the Emergency screen always shows it first, even signed out (BR-12). The
 * role check is the first line.
 *
 * @author Mahir Al Kamal
 */
import { databaseEmergencyContactStore } from '@/lib/adapters/emergencyContactAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { listEmergencyNumbers } from '@/services/emergencyContactService';

/**
 * Returns the building numbers in order.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ numbers }`, or an error (401 signed out, 403 not allowed).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewEmergencyNumbers');
    const numbers = await listEmergencyNumbers(databaseEmergencyContactStore(db));
    return Response.json({ numbers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
