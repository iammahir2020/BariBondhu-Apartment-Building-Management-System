/**
 * Choosing a new password: at first log-in, replacing the temporary one (BR-15), and after a reset link. Passwords
 * have at least 8 characters (NFR-04) and are never stored, logged or emailed in plain text; Supabase keeps only
 * the hash.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { AuditWriter } from '@/services/auditService';
import { passwordProblem } from '@/services/passwordRules';

/** Shown when the new password is the same as the current one. */
export const SAME_PASSWORD_MESSAGE = 'Choose a password different from the one you have now.';

/** Sets the signed-in user's password. */
export interface PasswordUpdater {
  /** Returns false when the new password equals the current one. */
  update(password: string): Promise<boolean>;
}

/** Clears the first-login flag once the user has their own password. */
export interface PasswordProfileStore {
  /** Turns off `mustChangePassword` and clears the temporary password's expiry. */
  markPasswordChanged(profileId: string): Promise<void>;
}

/** What {@link setOwnPassword} works with. */
export interface SetPasswordDeps {
  passwords: PasswordUpdater;
  profiles: PasswordProfileStore;
  audit: AuditWriter;
}

/**
 * Sets the signed-in user's own password and clears the first-login flag (BR-15). The audit entry records that the
 * password changed, never the password (NFR-04, NFR-27).
 * @param deps - Password updater, profile store and audit writer.
 * @param profileId - The signed-in user.
 * @param password - The new password.
 * @param action - Audit action: `account.password_change` at first log-in, `account.password_reset` from a link.
 * @throws AppError 400 if the password breaks the rules or equals the current one.
 */
export async function setOwnPassword(
  deps: SetPasswordDeps,
  profileId: string,
  password: string,
  action: 'account.password_change' | 'account.password_reset' = 'account.password_change',
): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new AppError('BAD_REQUEST', problem);

  if (!(await deps.passwords.update(password))) {
    throw new AppError('BAD_REQUEST', SAME_PASSWORD_MESSAGE);
  }
  await deps.profiles.markPasswordChanged(profileId);
  await deps.audit({
    actorId: profileId,
    action,
    entityType: 'profiles',
    entityId: profileId,
    oldValues: null,
    newValues: { mustChangePassword: false },
  });
}
