/**
 * How pages call the API: sends JSON and reads back either the data or the error body that every route returns
 * (see `errors.ts`), so each form only has to show `error.message`.
 *
 * @author Mahir Al Kamal
 */
import { INTERNAL_ERROR_MESSAGE, type ErrorBody } from '@/lib/errors';

/** What an API call returned: the data on success, or the error to show. */
export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ErrorBody['error'] };

/**
 * Sends a request to one of our API routes.
 * @param url - Route path, like `/api/sessions`.
 * @param method - HTTP method.
 * @param body - Sent as JSON when given.
 * @returns The parsed result; network failures come back as an error result, never thrown.
 */
export async function callApi<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: {
        code: 'INTERNAL',
        message: 'Could not reach the server. Check the connection and try again.',
      },
    };
  }

  const text = await response.text();
  const json: unknown = text === '' ? undefined : safeParse(text);
  if (response.ok) {
    return { ok: true, status: response.status, data: json as T };
  }
  if (isErrorBody(json)) {
    return { ok: false, status: response.status, error: json.error };
  }
  return {
    ok: false,
    status: response.status,
    error: { code: 'INTERNAL', message: INTERNAL_ERROR_MESSAGE },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error: unknown = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
