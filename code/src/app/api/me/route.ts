/**
 * The signed-in user's own account. Every role may call it, so it is the smallest example of the route shape
 * every feature copies: role check first, then the work, then JSON; errors through `toErrorResponse`.
 *
 * @author Mahir Al Kamal
 */
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';

/**
 * Returns who is signed in. Never returns anything about passwords.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with the account, or an error (401 signed out, 403 temporary password not replaced yet).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'viewOwnAccount');
    return Response.json({
      id: actor.id,
      username: actor.username,
      role: actor.role,
      displayName: actor.displayName,
      phone: actor.phone,
      email: actor.email,
      occupancyId: actor.occupancyId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
