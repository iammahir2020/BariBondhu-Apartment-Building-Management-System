/**
 * The building's emergency numbers (SG-06, BM-10, BB-2005, BB-2007).
 * Every permitted role can view them, but only the manager can edit them.
 * 999 is fixed and is never stored here.
 *
 * @author Adika Rahman
 */
import { databaseEmergencyContactStore } from '@/lib/adapters/emergencyContactAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { listEmergencyNumbers, updateEmergencyNumber } from '@/services/emergencyContactService';

/**
 * Returns the building numbers in order.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with the building numbers, or an error.
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

/**
 * Updates one building emergency number. Only the manager can do this.
 * Body: { label, phone }.
 * @param request - The request containing the new number.
 * @returns 200 with the updated number, or an error.
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'editEmergencyNumbers');

    const body = await readJsonObject(request);

    if (typeof body.label !== 'string' || typeof body.phone !== 'string') {
      throw new AppError('BAD_REQUEST', 'Enter a contact label and phone number.');
    }

    const number = await updateEmergencyNumber(
      databaseEmergencyContactStore(db),
      body.label,
      body.phone,
    );

    return Response.json({ number });
  } catch (error) {
    return toErrorResponse(error);
  }
}
