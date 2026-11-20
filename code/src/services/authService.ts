/**
 * Logging in and out for every role (RES-06, SG-01, BM-01, CM-05, MNT-06): username and password, refusing
 * deactivated accounts and expired temporary passwords (BR-15, NFR-04), and the idle limits that end a session
 * (NFR-07).
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { Role } from '@/lib/roles';
import type { SupabaseServerClient } from '@/lib/supabase/server';
import { profiles, type Profile } from '@/models';
import { internalEmail } from '@/services/accountService';

/** Shown for an unknown username or a wrong password, so the screen never tells which one it was. */
export const WRONG_LOGIN_MESSAGE = 'Wrong username or password.';

/** Shown when a deactivated account tries to log in (CM-05, BM-02). */
export const DEACTIVATED_MESSAGE =
  'This account has been deactivated. Ask the building manager if you think this is a mistake.';

/** Shown when a temporary password was not used within 7 days (NFR-04). */
export const TEMP_PASSWORD_EXPIRED_MESSAGE =
  'Your temporary password has expired. Ask the building manager for a new one. If you are the manager, ask the system administrator.';

const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;

/** Minutes without any request after which a session ends (NFR-07). */
export const IDLE_LIMIT_MINUTES: Readonly<Record<Role, number>> = {
  guard: 15,
  maintenance: 15,
  admin: 15,
  resident: 7 * DAY_MINUTES,
  manager: 7 * DAY_MINUTES,
  committee: 7 * DAY_MINUTES,
};

/** Signs a user in and out of the current browser's session. */
export interface SessionAuth {
  /** Returns the user's id, or null when the email and password don't match. */
  signIn(email: string, password: string): Promise<string | null>;
  /** Ends the session in this browser only; other devices of the same household stay logged in. */
  signOut(): Promise<void>;
}

/** Finds a profile by its user id. */
export interface ProfileFinder {
  findById(id: string): Promise<Profile | undefined>;
}

/** What {@link logIn} works with. */
export interface LogInDeps {
  auth: SessionAuth;
  profiles: ProfileFinder;
}

/**
 * Puts a typed username into the stored form: no surrounding spaces, lower case.
 * @param username - As typed.
 * @returns The stored form.
 */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Logs a user in by username. The password is checked first, so the account's state is only revealed to someone
 * who knows it.
 * @param deps - Session auth and profile finder.
 * @param input - Username and password as typed.
 * @param now - The current time.
 * @returns The logged-in user's profile.
 * @throws AppError 401 with {@link WRONG_LOGIN_MESSAGE} if the username or password is wrong.
 * @throws AppError 403 if the account is deactivated or its temporary password has expired; the session is ended.
 */
export async function logIn(
  deps: LogInDeps,
  input: { username: string; password: string },
  now: Date = new Date(),
): Promise<Profile> {
  const userId = await deps.auth.signIn(
    internalEmail(normaliseUsername(input.username)),
    input.password,
  );
  if (userId === null) {
    throw new AppError('UNAUTHORIZED', WRONG_LOGIN_MESSAGE);
  }

  const profile = await deps.profiles.findById(userId);
  if (!profile) {
    await deps.auth.signOut();
    throw new AppError('UNAUTHORIZED', WRONG_LOGIN_MESSAGE);
  }
  if (!profile.active) {
    await deps.auth.signOut();
    throw new AppError('FORBIDDEN', DEACTIVATED_MESSAGE);
  }
  if (isTempPasswordExpired(profile, now)) {
    await deps.auth.signOut();
    throw new AppError('FORBIDDEN', TEMP_PASSWORD_EXPIRED_MESSAGE);
  }
  return profile;
}

/**
 * Whether the account still has an unused temporary password that is past its 7 days (NFR-04).
 * @param profile - The account.
 * @param now - The current time.
 * @returns True when it can no longer be used.
 */
export function isTempPasswordExpired(
  profile: Pick<Profile, 'mustChangePassword' | 'tempPasswordExpiresAt'>,
  now: Date,
): boolean {
  return (
    profile.mustChangePassword &&
    profile.tempPasswordExpiresAt !== null &&
    profile.tempPasswordExpiresAt.getTime() <= now.getTime()
  );
}

/**
 * Whether a session has been idle too long for its role (NFR-07).
 * @param role - The user's role.
 * @param lastActiveAt - Time of the last request in ms since 1970, or null if unknown.
 * @param now - The current time.
 * @returns True when the session must end. An unknown last activity counts as idle.
 */
export function isIdleExpired(role: Role, lastActiveAt: number | null, now: Date): boolean {
  if (lastActiveAt === null || Number.isNaN(lastActiveAt)) return true;
  return now.getTime() - lastActiveAt > IDLE_LIMIT_MINUTES[role] * MINUTE_MS;
}

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
