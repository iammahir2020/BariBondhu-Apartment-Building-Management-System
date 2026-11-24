/**
 * A resident's guest passes (RES-03): list my household's passes, and create a new one. Residents only, for their
 * own household (`manageGuestPasses`, Own): the service takes the household from the signed-in account, never from
 * the request.
 *
 * @author Mahir Al Kamal
 */
import { databaseGuestPassStore, guestPassDeps } from '@/lib/adapters/guestPassAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readNewPassInput } from '@/lib/guestPassInput';
import { toGuestPassView } from '@/lib/guestPassResponse';
import { readJsonObject } from '@/lib/parse';
import { createGuestPass, listMyGuestPasses } from '@/services/guestPassService';

/**
 * My passes: my household's guest passes with their status now, the latest start first.
 * @param request - The request.
 * @returns 200 with `{ passes }`, or an error (401 signed out, 403 not a resident or moved out).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'manageGuestPasses');
    const passes = await listMyGuestPasses(databaseGuestPassStore(db), user.actor);
    return Response.json({ passes: passes.map(toGuestPassView) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Creates a pass from `{ guestName, guestCount, startsAt, endsAt }`, with the times as ISO strings.
 * @param request - The request.
 * @returns 201 with `{ pass }`, or an error (400 "Enter the guest's name", "Enter 1 to 20 guests" or "Check the
 * visit times", 401, 403).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireRole(request, 'manageGuestPasses');
    const input = readNewPassInput(await readJsonObject(request));
    const created = await createGuestPass(guestPassDeps(db), user.actor, input);
    return Response.json({ pass: toGuestPassView(created) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
