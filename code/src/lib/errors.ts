/**
 * The app's one error type and the helper that turns it into a JSON response, so every API route reports errors
 * the same way: `{ "error": { "code", "message", "details"? } }` with the matching HTTP status.
 *
 * @author Mahir Al Kamal
 */

/** HTTP status for each error code. */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
} as const;

/** Kind of error. `CONFLICT` is for a state change the state diagrams don't allow. */
export type ErrorCode = keyof typeof ERROR_STATUS;

/** Body of every error response. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Readonly<Record<string, unknown>>;
  };
}

/**
 * An error the user can be told about. The message is shown on screen, so it uses the SRS wording.
 *
 * @example
 * throw new AppError('CONFLICT', 'This bill is already paid.');
 * throw new AppError('TOO_MANY_REQUESTS', 'Too many wrong passwords.', { retryAfterSeconds: 840 });
 */
export class AppError extends Error {
  /** Kind of error. */
  readonly code: ErrorCode;
  /** HTTP status that goes with {@link AppError.code}. */
  readonly status: number;
  /** Extra facts for the screen, like how long a lockout has left. Never secrets. */
  readonly details?: Readonly<Record<string, unknown>>;

  /**
   * @param code - Kind of error; sets the HTTP status.
   * @param message - Text for the user, in the SRS wording.
   * @param details - Extra facts the screen may show.
   */
  constructor(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

/** Message for anything that isn't an {@link AppError}; the real cause stays in the server log. */
export const INTERNAL_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Turns any thrown value into a JSON error response. An {@link AppError} keeps its code, message and status.
 * Anything else is logged and answered with a plain 500, so internal details never reach the browser.
 * @param error - Whatever the route caught.
 * @returns The JSON response to send.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    if (error.details) body.error.details = error.details;
    return Response.json(body, { status: error.status });
  }

  console.error(error);
  const body: ErrorBody = { error: { code: 'INTERNAL', message: INTERNAL_ERROR_MESSAGE } };
  return Response.json(body, { status: ERROR_STATUS.INTERNAL });
}
