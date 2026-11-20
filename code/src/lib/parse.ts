/**
 * Small helpers routes use to read a JSON body and narrow its fields, so request data stays `unknown` until checked
 * and a bad body always gets the same 400 answer.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';

/** A JSON object whose fields are not checked yet. */
export type UnknownObject = Readonly<Record<string, unknown>>;

/**
 * Reads the request body as a JSON object.
 * @param request - The incoming request.
 * @returns The body's fields, still unchecked.
 * @throws AppError 400 if the body isn't a JSON object.
 */
export async function readJsonObject(request: Request): Promise<UnknownObject> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'The request is not valid JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError('BAD_REQUEST', 'The request is not a JSON object.');
  }
  return body as UnknownObject;
}

/**
 * Reads a required, non-empty string field.
 * @param body - The parsed body.
 * @param field - Field name.
 * @param label - The field's name on screen, for the error message.
 * @returns The value, trimmed unless `trim` is false.
 * @throws AppError 400 if the field is missing, not a string or empty.
 */
export function requireString(
  body: UnknownObject,
  field: string,
  label: string,
  { trim = true }: { trim?: boolean } = {},
): string {
  const raw = body[field];
  const value = typeof raw === 'string' ? (trim ? raw.trim() : raw) : '';
  if (value === '') {
    throw new AppError('BAD_REQUEST', `Enter your ${label}.`);
  }
  return value;
}
