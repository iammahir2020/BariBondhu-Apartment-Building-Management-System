/**
 * Records a guest entry at the gate.
 * BB-1705, SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import { databaseGuestPassGateStore } from '@/lib/adapters/guestPassGateAdapters';
import { databaseNotifier } from '@/lib/adapters/notificationAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';
import { recordGuestEntry } from '@/services/guestPassEntryService';

/**
 * Records a guest check-in against a pass.
 *
 * @param request - Incoming authenticated request.
 * @returns The saved visit and remaining guest allowance.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'runGate');

    const body = await readJsonObject(request);
    const passId = requireString(body, 'passId', 'guest pass ID');

    if (typeof body.guestsIn !== 'number' || !Number.isInteger(body.guestsIn)) {
      throw new AppError('BAD_REQUEST', 'Enter a valid number of guests.');
    }

    const enteredLater = body.enteredLater ?? false;

    if (typeof enteredLater !== 'boolean') {
      throw new AppError('BAD_REQUEST', 'Check the entered-later value.');
    }

    let enteredAt: Date | undefined;

    if (body.enteredAt !== undefined) {
      if (typeof body.enteredAt !== 'string') {
        throw new AppError('BAD_REQUEST', 'Check the entry time.');
      }

      enteredAt = new Date(body.enteredAt);

      if (Number.isNaN(enteredAt.getTime())) {
        throw new AppError('BAD_REQUEST', 'Check the entry time.');
      }
    }

    const result = await recordGuestEntry(
      {
        store: databaseGuestPassGateStore(db),
        notify: databaseNotifier(db),
      },
      {
        passId,
        guardId: actor.id,
        guestsIn: body.guestsIn,
        enteredLater,
        ...(enteredAt ? { enteredAt } : {}),
      },
    );

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
