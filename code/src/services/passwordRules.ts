/**
 * The password rules (BR-15, NFR-04), with no other imports, so the Set new password form can check them as the
 * user types. The server checks them again in `passwordService.ts`; the form's check is only a convenience.
 *
 * @author Mahir Al Kamal
 */

/** Fewest characters a password may have (BR-15, NFR-04). */
export const MIN_PASSWORD_LENGTH = 8;

/** Most characters a password may have: bcrypt, which Supabase uses, ignores anything after 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

/** Shown when a new password is too short. */
export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

/** Shown when a new password is too long. */
export const PASSWORD_TOO_LONG_MESSAGE = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;

/**
 * Checks a new password against the rules.
 * @param password - The password as typed.
 * @returns The message to show, or null when it is allowed.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }
  return null;
}
