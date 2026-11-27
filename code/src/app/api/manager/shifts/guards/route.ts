/**
 * List active guards for the manager's shift planner.
 * BB-1907, BM-09, NFR-06.
 *
 * @author Tawhid Bin Moslim
 */

import { and, eq } from 'drizzle-orm';

import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { profiles } from '@/models';

/**
 * Return active guards available for shift planning.
 *
 * @param request - Incoming authenticated request.
 * @returns Active guards with their IDs and display names.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'planShifts');

    const guards = await db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
      })
      .from(profiles)
      .where(and(eq(profiles.role, 'guard'), eq(profiles.active, true)))
      .orderBy(profiles.displayName);

    return Response.json({ guards });
  } catch (error) {
    return toErrorResponse(error);
  }
}
