/**
 * Forgot password (BR-15, all log-in stories): a reset link valid for 30 minutes goes to the account's real email;
 * an account with no email is told to ask the building manager (or, for the manager, the administrator). The
 * administrator's own password is reset by the development team, not here.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { EmailSender } from '@/lib/mailer';
import type { Profile } from '@/models';
import { internalEmail } from '@/services/accountService';
import type { AuditWriter } from '@/services/auditService';
import { DEACTIVATED_MESSAGE, normaliseUsername, type ProfileFinder } from '@/services/authService';
import { passwordProblem } from '@/services/passwordRules';
import type { PasswordProfileStore, PasswordUpdater } from '@/services/passwordService';

/** Minutes a reset link works (BR-15). Supabase's "Email OTP expiration" must be set to the same. */
export const RESET_LINK_MINUTES = 30;

/** Shown for a username that doesn't exist. Usernames are random, so this doesn't help guessing (NFR-05). */
export const UNKNOWN_USERNAME_MESSAGE = 'No account has this username. Check it and try again.';

/** Shown when the administrator asks for a reset link. */
export const ADMIN_RESET_MESSAGE =
  "The administrator's password is reset by the development team, not here.";

/** Shown when a reset link is wrong, used or older than 30 minutes. */
export const RESET_LINK_INVALID_MESSAGE =
  'This reset link has expired or was already used. Ask for a new one.';

/** What a reset request led to: a link sent to a masked address, or no email on the account. */
export type ResetRequestResult = { sent: true; maskedEmail: string } | { sent: false };

/** Finds a profile by username. */
export interface ProfileByUsername {
  /** The profile with this username (already normalised), if there is one. */
  findByUsername(username: string): Promise<Profile | undefined>;
}

/** Makes and checks Supabase recovery tokens. */
export interface RecoveryTokens {
  /** Makes a one-time token for the user with this internal address. */
  create(internalAddress: string): Promise<string>;
  /** Checks a token and signs its user in on this request; returns the user id, or null if it is invalid. */
  verify(token: string): Promise<string | null>;
}

/** What {@link requestPasswordReset} works with. */
export interface ResetRequestDeps {
  profiles: ProfileByUsername;
  tokens: RecoveryTokens;
  sendEmail: EmailSender;
}

/**
 * Hides most of an email address for the screen: `hasan@example.com` becomes `h•••@example.com`.
 * @param email - The address.
 * @returns The masked address.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email.charAt(0)}•••${email.slice(at)}`;
}

/**
 * The link a reset email carries.
 * @param appUrl - The app's public address, from `APP_URL`.
 * @param token - The recovery token.
 * @returns The Reset password page's address with the token.
 */
export function resetLink(appUrl: string, token: string): string {
  const url = new URL('/reset-password', appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Sends a reset link to the account's real email, if it has one (BR-15).
 * @param deps - Profile lookup, recovery tokens and email sender.
 * @param username - The username as typed.
 * @param appUrl - The app's public address, for the link.
 * @returns Where the link went, or that the account has no email.
 * @throws AppError 404 for an unknown username, 403 for a deactivated account, 400 for the administrator.
 */
export async function requestPasswordReset(
  deps: ResetRequestDeps,
  username: string,
  appUrl: string,
): Promise<ResetRequestResult> {
  const profile = await deps.profiles.findByUsername(normaliseUsername(username));
  if (!profile) throw new AppError('NOT_FOUND', UNKNOWN_USERNAME_MESSAGE);
  if (!profile.active) throw new AppError('FORBIDDEN', DEACTIVATED_MESSAGE);
  if (profile.role === 'admin') throw new AppError('BAD_REQUEST', ADMIN_RESET_MESSAGE);
  if (!profile.email) return { sent: false };

  const token = await deps.tokens.create(internalEmail(profile.username));
  await deps.sendEmail({
    to: profile.email,
    subject: 'Reset your BariBondhu password',
    text: [
      `Hello ${profile.displayName},`,
      '',
      `Someone asked to reset the password of the BariBondhu account ${profile.username}.`,
      `Open this link within ${RESET_LINK_MINUTES} minutes to choose a new password:`,
      '',
      resetLink(appUrl, token),
      '',
      "If you didn't ask for this, ignore this email. Your password stays the same.",
    ].join('\n'),
  });
  return { sent: true, maskedEmail: maskEmail(profile.email) };
}

/** What {@link resetPassword} works with. */
export interface ResetPasswordDeps {
  tokens: RecoveryTokens;
  profiles: ProfileFinder & PasswordProfileStore;
  passwords: PasswordUpdater;
  audit: AuditWriter;
}

/**
 * Sets a new password from a reset link. The password is checked before the one-time token is used, so a rule
 * mistake doesn't waste the link. Clears the first-login flag, as the user has now chosen their own password.
 * @param deps - Recovery tokens, profiles, password updater and audit writer.
 * @param token - The token from the link.
 * @param password - The new password.
 * @returns The user's profile; they are now signed in.
 * @throws AppError 400 if the password breaks the rules or the link is invalid or expired.
 * @throws AppError 403 if the account is deactivated.
 */
export async function resetPassword(
  deps: ResetPasswordDeps,
  token: string,
  password: string,
): Promise<Profile> {
  const problem = passwordProblem(password);
  if (problem) throw new AppError('BAD_REQUEST', problem);

  const userId = await deps.tokens.verify(token);
  if (userId === null) throw new AppError('BAD_REQUEST', RESET_LINK_INVALID_MESSAGE);
  const profile = await deps.profiles.findById(userId);
  if (!profile) throw new AppError('BAD_REQUEST', RESET_LINK_INVALID_MESSAGE);
  if (!profile.active) throw new AppError('FORBIDDEN', DEACTIVATED_MESSAGE);

  // Choosing the same password again is fine here: the user just wants to get back in.
  await deps.passwords.update(password);
  await deps.profiles.markPasswordChanged(profile.id);
  await deps.audit({
    actorId: profile.id,
    action: 'account.password_reset',
    entityType: 'profiles',
    entityId: profile.id,
    oldValues: null,
    newValues: { mustChangePassword: false },
  });
  return { ...profile, mustChangePassword: false, tempPasswordExpiresAt: null };
}
