/**
 * One of my household's guest passes (RES-03), for the Pass code screen. Residents only, for their own household's
 * passes (`manageGuestPasses`, Own): the service refuses another household's pass.
 *
 * @author Mahir Al Kamal
 */
import { databaseGuestPassStore } from '@/lib/adapters/guestPassAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requirePassId } from '@/lib/guestPassInput';
import { toGuestPassView } from '@/lib/guestPassResponse';
import { getMyGuestPass } from '@/services/guestPassService';

/**
 * The pass in the URL, with its status now.
 * @param request - The request.
 * @param context - The route's `[id]`.
 * @returns 200 with `{ pass }`, or an error (401, 403 not ours, 404).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireRole(request, 'manageGuestPasses');
    const passId = requirePassId((await context.params).id);
    const pass = await getMyGuestPass(databaseGuestPassStore(db), user.actor, passId);
    return Response.json({ pass: toGuestPassView(pass) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
