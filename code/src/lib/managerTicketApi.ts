/**
 * Request validation shared by manager ticket action routes.
 *
 * @author Jannatul Ferdus Nishi
 */
import { AppError } from '@/lib/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks a UUID supplied by a manager ticket API client.
 * @param value - Untrusted string.
 * @returns True when the value has the UUID shape used by route identifiers.
 */
export function isManagerTicketUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Validates a ticket identifier from a route parameter.
 * @param id - Untrusted route parameter.
 * @returns The valid identifier.
 * @throws AppError 400 when the identifier is not a UUID.
 */
export function requireManagerTicketId(id: string): string {
  if (!isManagerTicketUuid(id)) throw new AppError('BAD_REQUEST', 'Invalid ticket ID.');
  return id;
}

/**
 * Reads an optional text value and returns null for an omitted, null or blank field.
 * @param value - Untrusted JSON field.
 * @param label - Field label for a validation error.
 * @returns The trimmed value, or null.
 * @throws AppError 400 when a supplied value is not a string.
 */
export function optionalManagerTicketText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError('BAD_REQUEST', `Enter valid ${label}.`);
  }
  return value.trim() || null;
}

/**
 * Reads a required ticket reason without masking the service's standard blank-reason error.
 * @param value - Untrusted JSON field.
 * @returns The string reason or an empty string for the service validator.
 * @throws AppError 400 when a supplied value is not a string.
 */
export function managerTicketReason(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new AppError('BAD_REQUEST', 'Enter a valid reason.');
  return value;
}
