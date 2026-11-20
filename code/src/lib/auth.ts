/**
 * Who is signed in, and whether they may do this (NFR-06). API routes call {@link requireRole} as their first line;
 * role layouts call {@link requirePageRole}. The rules themselves are in `permissions.ts`; this file only reads the
 * session and the profile.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { checkRole, type Action, type Authorized } from '@/lib/permissions';
import type { Role } from '@/lib/roles';
import {
  createSupabaseRequestClient,
  createSupabaseServerClient,
  type SupabaseServerClient,
} from '@/lib/supabase/server';
import type { Profile } from '@/models';
import { databaseProfileFinder } from '@/services/authService';

/** Shown when a request needs a signed-in user and there isn't one. */
export const NOT_LOGGED_IN_MESSAGE = 'Your session has ended. Log in again.';

/** A signed-in user who passed a role check, with their whole profile. */
export type AuthorizedUser = Authorized<Profile>;

/**
 * The active profile of whoever is signed in, if anyone.
 * @param supabase - A Supabase client with the request's session.
 * @returns The profile, or undefined when signed out, missing or deactivated.
 */
async function activeProfile(supabase: SupabaseServerClient): Promise<Profile | undefined> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;
  const profile = await databaseProfileFinder(db).findById(user.id);
  return profile?.active ? profile : undefined;
}

/**
 * Returns the signed-in user's profile, for routes every signed-in user may call whatever their role or password
 * state (like choosing a new password).
 * @param supabase - A Supabase client with the request's session.
 * @returns The active profile.
 * @throws AppError 401 if nobody is signed in, or the account is missing or deactivated.
 */
export async function requireCurrentProfile(supabase: SupabaseServerClient): Promise<Profile> {
  const profile = await activeProfile(supabase);
  if (!profile) throw new AppError('UNAUTHORIZED', NOT_LOGGED_IN_MESSAGE);
  return profile;
}

/**
 * The role check every API route makes first (NFR-06).
 * @param request - The incoming request; its cookies carry the session.
 * @param action - The row of the permissions table the route belongs to.
 * @returns The user and their scope (`all` or `own`). For `own`, also call `requireOwnOccupancy` or
 * `requireOwnTicket` once the record is loaded.
 * @throws AppError 401 if nobody is signed in.
 * @throws AppError 403 if the role may not do this, or the user must first replace a temporary password.
 */
export async function requireRole(request: Request, action: Action): Promise<AuthorizedUser> {
  const profile = await requireCurrentProfile(createSupabaseRequestClient(request));
  return checkRole(profile, action);
}

/**
 * The check in each role's layout, so a page under `/manager` only opens for the manager (NFR-06). Anyone else is
 * sent where they belong instead of seeing the page.
 * @param role - The role the pages are for.
 * @returns The signed-in user's profile.
 */
export async function requirePageRole(role: Role): Promise<Profile> {
  const profile = await activeProfile(await createSupabaseServerClient());
  if (!profile) redirect('/login');
  if (profile.mustChangePassword) redirect('/set-password');
  if (profile.role !== role) redirect(`/${profile.role}`);
  return profile;
}
