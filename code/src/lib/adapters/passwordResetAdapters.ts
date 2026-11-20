/**
 * Supabase and database adapters for `passwordResetService.ts`: make and check recovery tokens, and find profiles
 * by username. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import { profiles } from '@/models';
import type { ProfileByUsername, RecoveryTokens } from '@/services/passwordResetService';

/**
 * {@link RecoveryTokens} backed by Supabase: the admin API makes the token, and the request's own client checks
 * it, which signs the user in on this browser.
 * @param admin - The service-role client.
 * @param session - Supabase server client for the request.
 * @returns The token maker and checker.
 */
export function supabaseRecoveryTokens(
  admin: SupabaseClient,
  session: SupabaseServerClient,
): RecoveryTokens {
  return {
    async create(internalAddress) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: internalAddress,
      });
      if (error) throw error;
      return data.properties.hashed_token;
    },
    async verify(token) {
      const { data, error } = await session.auth.verifyOtp({ type: 'recovery', token_hash: token });
      if (error || !data.user) return null;
      return data.user.id;
    },
  };
}

/**
 * A {@link ProfileByUsername} backed by the `profiles` table.
 * @param db - Database to use.
 * @returns The finder.
 */
export function databaseProfileByUsername(db: Database): ProfileByUsername {
  return {
    async findByUsername(username) {
      const [row] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.username, username))
        .limit(1);
      return row;
    },
  };
}
