/**
 * Check a guest pass code at the gate.
 * BB-1705, SG-02.
 */

import { databaseGuestPassGateStore } from '@/lib/adapters/guestPassGateAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';
import { checkGuestPass } from '@/services/guestPassCheckService';

/**
 * Check a six-digit guest pass code.
 *
 * @param request - Incoming authenticated request.
 * @returns Guest and flat details, pass status and check-in permission.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'runGate');

    const body = await readJsonObject(request);
    const code = requireString(body, 'code', 'six-digit pass code');

    if (!/^\d{6}$/.test(code)) {
      return Response.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Enter a valid six-digit pass code.',
          },
        },
        { status: 400 },
      );
    }

    const result = await checkGuestPass({ passes: databaseGuestPassGateStore(db) }, code);

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
