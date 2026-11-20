/**
 * Logging in and out for every role (RES-06, SG-01, BM-01, CM-05, MNT-06): username and password, the
 * wrong-password limit (BR-14), refusing deactivated accounts and expired temporary passwords (BR-15, NFR-04), and
 * the idle limits that end a session (NFR-07).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { Role } from '@/lib/roles';
import type { Profile } from '@/models';
import { internalEmail } from '@/services/accountService';

/** Shown for an unknown username or a wrong password, so the screen never tells which one it was. */
export const WRONG_LOGIN_MESSAGE = 'Wrong username or password.';

/** Shown when a deactivated account tries to log in (CM-05, BM-02). */
export const DEACTIVATED_MESSAGE =
  'This account has been deactivated. Ask the building manager if you think this is a mistake.';

/** Shown, with the time left, when a device or gate username must wait (BR-14). */
export const TOO_MANY_WRONG_MESSAGE = 'Too many wrong passwords.';

/** Wrong passwords in a row that start a wait (BR-14). */
export const MAX_WRONG_PASSWORDS = 5;

/** How long the wait lasts (BR-14). */
export const LOCKOUT_MINUTES = 15;

/** Longest username kept in a counting key; real usernames are 9 characters. */
const MAX_KEY_USERNAME_LENGTH = 64;

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
  /** The profile with this Supabase user id, if there is one. */
  findById(id: string): Promise<Profile | undefined>;
}

/** A counting key's wrong-password state. */
export interface AttemptState {
  failedCount: number;
  lockedUntil: Date | null;
}

/** Keeps wrong-password counts (BR-14). */
export interface LoginAttemptStore {
  /** The key's state, or undefined if it has no wrong passwords on record. */
  get(key: string): Promise<AttemptState | undefined>;
  /** Stores the key's new state, noting when it changed. */
  save(key: string, state: AttemptState, now: Date): Promise<void>;
  /** Forgets the key, after a successful log-in. */
  clear(key: string): Promise<void>;
}

/** What {@link logIn} works with. */
export interface LogInDeps {
  auth: SessionAuth;
  profiles: ProfileFinder;
  attempts: LoginAttemptStore;
}

/**
 * The key wrong passwords are counted under (BR-14). An ordinary browser counts per device, so nobody can lock
 * another person out. The gate device counts per username on that device, so one guard's mistakes, or a
 * stranger's, never block another guard.
 * @param deviceId - The browser's random device id.
 * @param username - The username as typed.
 * @param onGateDevice - True on the shared gate device.
 * @returns `device:<id>` or `gate:<id>:<username>`.
 */
export function attemptKey(deviceId: string, username: string, onGateDevice: boolean): string {
  if (!onGateDevice) return `device:${deviceId}`;
  return `gate:${deviceId}:${normaliseUsername(username).slice(0, MAX_KEY_USERNAME_LENGTH)}`;
}

/**
 * How long a key must still wait.
 * @param state - The key's state, if it has one.
 * @param now - The current time.
 * @returns Whole seconds left, rounded up; 0 when it may try.
 */
export function lockSecondsLeft(state: AttemptState | undefined, now: Date): number {
  if (!state?.lockedUntil) return 0;
  return Math.max(0, Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * The state after one more wrong password. The 5th in a row starts a 15-minute wait; after a wait ends, counting
 * starts again from zero (BR-14).
 * @param state - The key's state before, if it has one.
 * @param now - The current time.
 * @returns The new state.
 */
export function afterWrongPassword(state: AttemptState | undefined, now: Date): AttemptState {
  const waitEnded = state?.lockedUntil != null && state.lockedUntil.getTime() <= now.getTime();
  const failedCount = (waitEnded ? 0 : (state?.failedCount ?? 0)) + 1;
  return {
    failedCount,
    lockedUntil:
      failedCount >= MAX_WRONG_PASSWORDS
        ? new Date(now.getTime() + LOCKOUT_MINUTES * MINUTE_MS)
        : null,
  };
}

/** The error for a key that must wait, with the seconds left for the screen. */
function tooManyWrong(secondsLeft: number): AppError {
  return new AppError('TOO_MANY_REQUESTS', TOO_MANY_WRONG_MESSAGE, {
    retryAfterSeconds: secondsLeft,
  });
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
 * Logs a user in by username. A key that is waiting is refused before the password is tried (BR-14). The password
 * is checked before the account's state, so that state is only revealed to someone who knows the password.
 * @param deps - Session auth, profile finder and wrong-password store.
 * @param input - Username and password as typed, and the key to count wrong passwords under ({@link attemptKey}).
 * @param now - The current time.
 * @returns The logged-in user's profile.
 * @throws AppError 429 with `retryAfterSeconds` if the key must wait, including after the 5th wrong password.
 * @throws AppError 401 with {@link WRONG_LOGIN_MESSAGE} if the username or password is wrong.
 * @throws AppError 403 if the account is deactivated or its temporary password has expired; the session is ended.
 */
export async function logIn(
  deps: LogInDeps,
  input: { username: string; password: string; attemptKey: string },
  now: Date = new Date(),
): Promise<Profile> {
  const before = await deps.attempts.get(input.attemptKey);
  const waiting = lockSecondsLeft(before, now);
  if (waiting > 0) throw tooManyWrong(waiting);

  const userId = await deps.auth.signIn(
    internalEmail(normaliseUsername(input.username)),
    input.password,
  );
  if (userId === null) {
    const after = afterWrongPassword(before, now);
    await deps.attempts.save(input.attemptKey, after, now);
    const nowWaiting = lockSecondsLeft(after, now);
    if (nowWaiting > 0) throw tooManyWrong(nowWaiting);
    throw new AppError('UNAUTHORIZED', WRONG_LOGIN_MESSAGE);
  }
  if (before) await deps.attempts.clear(input.attemptKey);

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
