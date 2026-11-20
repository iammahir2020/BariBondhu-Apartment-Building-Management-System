/**
 * Supabase and database adapters for `passwordService.ts`: set the signed-in user's password and clear the
 * first-login flag. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import { profiles } from '@/models';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/services/passwordRules';
import type { PasswordProfileStore, PasswordUpdater } from '@/services/passwordService';

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
