/**
 * Supabase and database adapters for `authService.ts`: sign in and out with Supabase Auth, find profiles, and keep
 * wrong-password counts. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import { loginAttempts, profiles } from '@/models';
import type { LoginAttemptStore, ProfileFinder, SessionAuth } from '@/services/authService';

/**
 * A {@link SessionAuth} backed by Supabase Auth and this request's cookies.
 * @param client - Supabase server client for the request.
 * @returns The session auth.
 */
export function supabaseSessionAuth(client: SupabaseServerClient): SessionAuth {
  return {
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === 'invalid_credentials') return null;
        throw error;
      }
      return data.user.id;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
  };
}

/**
 * A {@link LoginAttemptStore} backed by the `login_attempts` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseLoginAttemptStore(db: Database): LoginAttemptStore {
  return {
    async get(key) {
      const [row] = await db
        .select({ failedCount: loginAttempts.failedCount, lockedUntil: loginAttempts.lockedUntil })
        .from(loginAttempts)
        .where(eq(loginAttempts.key, key))
        .limit(1);
      return row;
    },
    async save(key, state, now) {
      const values = { ...state, updatedAt: now };
      await db
        .insert(loginAttempts)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: loginAttempts.key, set: values });
    },
    async clear(key) {
      await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    },
  };
}

/**
 * A {@link ProfileFinder} backed by the `profiles` table.
 * @param db - Database to use.
 * @returns The finder.
 */
export function databaseProfileFinder(db: Database): ProfileFinder {
  return {
    async findById(id) {
      const [row] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
      return row;
    },
  };
}
