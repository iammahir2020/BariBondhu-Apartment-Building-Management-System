/**
 * Finds who is signed in on this request: the Supabase user from the session cookie and their profile. Step 7's
 * role check builds on it.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/models';
import { databaseProfileFinder } from '@/services/authService';

/** Shown when a request needs a signed-in user and there isn't one. */
export const NOT_LOGGED_IN_MESSAGE = 'Your session has ended. Log in again.';

/**
 * Returns the signed-in user's profile.
 * @param supabase - Supabase server client for the request.
 * @returns The active profile.
 * @throws AppError 401 if nobody is signed in, or the account is missing or deactivated.
 */
export async function requireCurrentProfile(supabase: SupabaseServerClient): Promise<Profile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await databaseProfileFinder(db).findById(user.id) : undefined;
  if (!profile || !profile.active) {
    throw new AppError('UNAUTHORIZED', NOT_LOGGED_IN_MESSAGE);
  }
  return profile;
}
