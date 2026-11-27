/**
 * View the signed-in guard's own shifts.
 * BB-1906, SG-05, NFR-06.
 *
 * A guard can only view their own assigned shifts.
 *
 * @author Tawhid Bin Moslim Tawhid
 */

import { databaseShiftStore } from '@/lib/adapters/shiftAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { getMyDutyList } from '@/services/shiftDutyService';

/**
 * Return the signed-in guard's shifts for the next seven days.
 *
 * @param request - Incoming authenticated request.
 * @returns The guard's shifts and today's shift status.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'viewOwnShift');

    const duty = await getMyDutyList(
      {
        shifts: databaseShiftStore(db),
      },
      actor.id,
      new Date(),
    );

    return Response.json(duty);
  } catch (error) {
    return toErrorResponse(error);
  }
}
