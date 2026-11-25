/**
 * Reading a bill id from a route's URL (RES-01). Bill ids are UUIDs; anything else is answered as a missing bill, the
 * same as a UUID with no bill, instead of reaching the database.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { MY_BILL_ERRORS } from '@/services/myBillsService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks a bill id from the URL.
 * @param id - The `[id]` segment.
 * @returns The id, unchanged.
 * @throws AppError 404 "This bill does not exist." if it isn't a UUID.
 */
export function requireBillId(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new AppError('NOT_FOUND', MY_BILL_ERRORS.notFound);
  return id;
}
