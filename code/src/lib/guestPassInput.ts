/**
 * Reads the guest pass routes' input (RES-03): the New guest pass form as JSON, and pass ids from the URL.
 * Everything stays `unknown` until checked here, and a value of the wrong kind is passed on as missing or invalid,
 * so the service answers it with its own wording ("Enter the guest's name", "Enter 1 to 20 guests", "Check the
 * visit times"). The rules themselves are in `guestPassService.ts`.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { UnknownObject } from '@/lib/parse';
import { CANCEL_PASS_ERRORS, type NewPassInput } from '@/services/guestPassService';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A guest pass id from the URL.
 * @param id - The `[id]` segment.
 * @returns The id.
 * @throws AppError 404 if it isn't a UUID, so it can't name any pass.
 */
export function requirePassId(id: string): string {
  if (!UUID.test(id)) throw new AppError('NOT_FOUND', CANCEL_PASS_ERRORS.notFound);
  return id;
}

/** A time sent as an ISO string, or null when it is missing or not a string. */
function timeField(value: unknown): Date | null {
  return typeof value === 'string' && value.trim() !== '' ? new Date(value) : null;
}

/** The number of guests: a number, or a string of digits from a form field; anything else is NaN. */
function countField(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) return Number(value);
  return Number.NaN;
}

/**
 * Reads the New guest pass form: `{ guestName, guestCount, startsAt, endsAt }`, with the times as ISO strings.
 * @param body - The parsed JSON body.
 * @returns The input for `createGuestPass`. A time that can't be read is an Invalid Date, which the service refuses.
 */
export function readNewPassInput(body: UnknownObject): NewPassInput {
  return {
    guestName: typeof body.guestName === 'string' ? body.guestName : '',
    guestCount: countField(body.guestCount),
    startsAt: timeField(body.startsAt),
    endsAt: timeField(body.endsAt),
  };
}
