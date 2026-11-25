/**
 * Cancels one of my household's guest passes (RES-03 c4), so its code stops working for new entries at once.
 * Residents only, for their own household's passes (`manageGuestPasses`, Own): the service refuses another
 * household's pass.
 *
 * @author Mahir Al Kamal
 */
import { guestPassDeps } from '@/lib/adapters/guestPassAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { requirePassId } from '@/lib/guestPassInput';
import { toGuestPassView } from '@/lib/guestPassResponse';
import { cancelGuestPass } from '@/services/guestPassService';

/**
 * Cancels the pass in the URL.
 * @param request - The request.
 * @param context - The route's `[id]`.
 * @returns 200 with `{ pass }`, now Cancelled, or an error (401, 403 not ours, 404, 409 already Cancelled, Expired
 * or Fully used, with `details.status`).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireRole(request, 'manageGuestPasses');
    const passId = requirePassId((await context.params).id);
    const cancelled = await cancelGuestPass(guestPassDeps(db), user.actor, passId);
    return Response.json({ pass: toGuestPassView(cancelled) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
