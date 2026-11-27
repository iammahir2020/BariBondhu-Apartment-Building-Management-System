/**
 * Plan a guard shift.
 * BB-1906, BM-09, NFR-06.
 *
 * Only an authorised manager may plan guard shifts.
 *
 * @author Tawhid Bin Moslim
 */

import { databaseShiftStore } from '@/lib/adapters/shiftAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';
import { planShift } from '@/services/shiftService';

/**
 * Create a planned shift for a guard.
 *
 * @param request - Request containing guard ID and shift times.
 * @returns The created shift or an error response.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'planShifts');

    const body = await readJsonObject(request);

    const guardId = requireString(body, 'guardId', 'Guard ID');
    const startsAt = requireString(body, 'startsAt', 'Start time');
    const endsAt = requireString(body, 'endsAt', 'End time');

    const shift = await planShift(
      {
        shifts: databaseShiftStore(db),
      },
      {
        guardId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
      },
    );

    return Response.json({ shift }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
