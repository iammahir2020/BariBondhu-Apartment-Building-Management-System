/**
 * Choosing a new password: at first log-in, replacing the temporary one (BR-15), and after a reset link. Passwords
 * have at least 8 characters (NFR-04) and are never stored, logged or emailed in plain text; Supabase keeps only
 * the hash.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import { profiles } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import { PASSWORD_TOO_SHORT_MESSAGE, passwordProblem } from '@/services/passwordRules';

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

/**
 * A {@link PasswordUpdater} for the user signed in on this request.
 * @param client - Supabase server client for the request.
 * @returns The updater.
 */
export function supabasePasswordUpdater(client: SupabaseServerClient): PasswordUpdater {
  return {
    async update(password) {
      const { error } = await client.auth.updateUser({ password });
      if (!error) return true;
      if (error.code === 'same_password') return false;
      if (error.code === 'weak_password') {
        throw new AppError('BAD_REQUEST', PASSWORD_TOO_SHORT_MESSAGE);
      }
      throw error;
    },
  };
}

/**
 * A {@link PasswordProfileStore} backed by the `profiles` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databasePasswordProfileStore(db: Database): PasswordProfileStore {
  return {
    async markPasswordChanged(profileId) {
      await db
        .update(profiles)
        .set({ mustChangePassword: false, tempPasswordExpiresAt: null })
        .where(eq(profiles.id, profileId));
    },
  };
}
