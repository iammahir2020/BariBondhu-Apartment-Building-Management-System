/**
 * Creating accounts: generated usernames (never the flat number, NFR-05), temporary passwords that must be changed
 * at first log-in and expire after 7 days unused (BR-15, NFR-04), and the Supabase user behind each profile, made
 * under an internal address because users log in by username, not email (decisions §2).
 *
 * @author Mahir Al Kamal
 */
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { Role } from '@/lib/roles';
import { profiles, type Profile } from '@/models';
import type { AuditWriter } from '@/services/auditService';

/** Letters and digits that can't be mistaken for each other when read out or copied (no l/1, o/0, i). */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Every username starts with this, so it can never equal a flat number like `4B`. */
export const USERNAME_PREFIX = 'bb-';

/** Random characters after the prefix: 31^6, about 890 million usernames. */
export const USERNAME_RANDOM_LENGTH = 6;

/** Length of a temporary password. */
export const TEMP_PASSWORD_LENGTH = 10;

/** Days an unused temporary password keeps working (NFR-04). */
export const TEMP_PASSWORD_VALID_DAYS = 7;

/** Domain of the internal addresses Supabase knows users by. `.invalid` can never receive mail. */
export const INTERNAL_EMAIL_DOMAIN = 'users.baribondhu.invalid';

/** Picks a whole number from 0 up to (not including) `max`. Tests pass a fixed one. */
export type RandomInt = (max: number) => number;

const secureRandomInt: RandomInt = (max) => randomInt(max);

/**
 * Makes a random string from {@link CODE_ALPHABET}.
 * @param length - Number of characters.
 * @param random - Source of randomness; cryptographically secure by default.
 * @returns The string.
 */
export function randomCode(length: number, random: RandomInt = secureRandomInt): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET.charAt(random(CODE_ALPHABET.length));
  }
  return code;
}

/**
 * Makes a new username like `bb-4k7q2m`: not guessable and never a flat number (NFR-05).
 * @param random - Source of randomness.
 * @returns The username.
 */
export function generateUsername(random: RandomInt = secureRandomInt): string {
  return USERNAME_PREFIX + randomCode(USERNAME_RANDOM_LENGTH, random);
}

/**
 * Makes a temporary password for a new account or a reset by the manager (BR-15).
 * @param random - Source of randomness.
 * @returns The password, shown once to the person who created the account.
 */
export function generateTempPassword(random: RandomInt = secureRandomInt): string {
  return randomCode(TEMP_PASSWORD_LENGTH, random);
}

/**
 * The address Supabase knows a user by.
 * @param username - The generated username.
 * @returns `<username>@users.baribondhu.invalid`.
 */
export function internalEmail(username: string): string {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

/**
 * When a temporary password issued now stops working.
 * @param now - When it is issued.
 * @returns The time 7 days later.
 */
export function tempPasswordExpiry(now: Date): Date {
  return new Date(now.getTime() + TEMP_PASSWORD_VALID_DAYS * 24 * 60 * 60 * 1000);
}

/** Creates and removes Supabase users. */
export interface AuthUserAdmin {
  /** Creates a confirmed user and returns its id. */
  createUser(email: string, password: string): Promise<string>;
  /** Removes a user; used only to undo a half-made account. */
  deleteUser(id: string): Promise<void>;
}

/** The profile reads and writes account creation needs. */
export interface AccountProfileStore {
  usernameTaken(username: string): Promise<boolean>;
  insert(profile: typeof profiles.$inferInsert): Promise<Profile>;
}

/** What {@link createAccount} works with. */
export interface AccountDeps {
  users: AuthUserAdmin;
  profiles: AccountProfileStore;
  audit: AuditWriter;
}

/** Details of a new account. */
export interface NewAccountInput {
  role: Role;
  displayName: string;
  phone?: string | null;
  /** A real email, used only for password reset links (BR-15). */
  email?: string | null;
  /** The household's occupancy: required for residents, not allowed for other roles. */
  occupancyId?: string | null;
}

/** A new account and its temporary password, which is not stored anywhere in plain text (NFR-04). */
export interface CreatedAccount {
  profile: Profile;
  username: string;
  temporaryPassword: string;
}

/** How many times to try for a username nobody has. A clash is already about 1 in 890 million. */
const USERNAME_TRIES = 5;

/**
 * Creates an account: a Supabase user with a temporary password and its profile, which must change the password
 * at first log-in (BR-15). Logged in the audit log without the password (NFR-27).
 * @param deps - Supabase user admin, profile store and audit writer.
 * @param input - Role, name and contact details.
 * @param actorId - The account creating it, or null for the seed script.
 * @param now - The current time.
 * @param random - Source of randomness.
 * @returns The profile, username and temporary password.
 * @throws AppError 400 if the name is empty, or a resident has no occupancy, or another role has one.
 * @throws AppError 500 if no free username is found.
 */
export async function createAccount(
  deps: AccountDeps,
  input: NewAccountInput,
  actorId: string | null,
  now: Date = new Date(),
  random: RandomInt = secureRandomInt,
): Promise<CreatedAccount> {
  const displayName = input.displayName.trim();
  if (displayName === '') {
    throw new AppError('BAD_REQUEST', 'Enter a name for the account.');
  }
  const occupancyId = input.occupancyId ?? null;
  if (input.role === 'resident' && occupancyId === null) {
    throw new AppError('BAD_REQUEST', 'A household account needs an occupancy.');
  }
  if (input.role !== 'resident' && occupancyId !== null) {
    throw new AppError('BAD_REQUEST', 'Only household accounts belong to an occupancy.');
  }

  let username: string | undefined;
  for (let i = 0; i < USERNAME_TRIES && username === undefined; i += 1) {
    const candidate = generateUsername(random);
    if (!(await deps.profiles.usernameTaken(candidate))) username = candidate;
  }
  if (username === undefined) {
    throw new AppError('INTERNAL', 'Could not make a new username. Please try again.');
  }

  const temporaryPassword = generateTempPassword(random);
  const userId = await deps.users.createUser(internalEmail(username), temporaryPassword);
  let profile: Profile;
  try {
    profile = await deps.profiles.insert({
      id: userId,
      username,
      role: input.role,
      displayName,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      occupancyId,
      mustChangePassword: true,
      tempPasswordExpiresAt: tempPasswordExpiry(now),
      active: true,
    });
  } catch (error) {
    await deps.users.deleteUser(userId);
    throw error;
  }

  await deps.audit({
    actorId,
    action: 'account.create',
    entityType: 'profiles',
    entityId: profile.id,
    oldValues: null,
    newValues: {
      username: profile.username,
      role: profile.role,
      displayName: profile.displayName,
      phone: profile.phone,
      email: profile.email,
      occupancyId: profile.occupancyId,
    },
  });
  return { profile, username, temporaryPassword };
}

/**
 * An {@link AuthUserAdmin} backed by Supabase's admin API.
 * @param admin - The service-role client.
 * @returns The user admin.
 */
export function supabaseUserAdmin(admin: SupabaseClient): AuthUserAdmin {
  return {
    async createUser(email, password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      return data.user.id;
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
  };
}

/**
 * An {@link AccountProfileStore} backed by the `profiles` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseAccountProfileStore(db: Database): AccountProfileStore {
  return {
    async usernameTaken(username) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.username, username))
        .limit(1);
      return rows.length > 0;
    },
    async insert(profile) {
      const [row] = await db.insert(profiles).values(profile).returning();
      if (!row) throw new Error('Profile insert returned no row.');
      return row;
    },
  };
}
