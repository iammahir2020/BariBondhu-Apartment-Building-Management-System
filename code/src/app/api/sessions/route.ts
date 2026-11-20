/**
 * Sessions: log in (POST) and log out (DELETE) for every role (RES-06, SG-01, BM-01, CM-05, MNT-06). Logging in
 * is the one action open to signed-out users, so there is no role check here.
 *
 * @author Mahir Al Kamal
 */
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';
import { LAST_ACTIVE_COOKIE, lastActiveCookie } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { databaseProfileFinder, logIn, supabaseSessionAuth } from '@/services/authService';

/**
 * Logs in with `{ username, password }`.
 * @param request - The request.
 * @returns 200 with `{ role, home, mustChangePassword }`, or an error (401 wrong details, 403 refused).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const username = requireString(body, 'username', 'username');
    const password = requireString(body, 'password', 'password', { trim: false });

    const supabase = await createSupabaseServerClient();
    const profile = await logIn(
      { auth: supabaseSessionAuth(supabase), profiles: databaseProfileFinder(db) },
      { username, password },
    );

    (await cookies()).set(lastActiveCookie(profile.role, new Date()));
    return Response.json({
      role: profile.role,
      home: profile.mustChangePassword ? '/set-password' : `/${profile.role}`,
      mustChangePassword: profile.mustChangePassword,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Logs out of this browser only; the household's other devices stay logged in.
 * @returns 204.
 */
export async function DELETE(): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabaseSessionAuth(supabase).signOut();
    (await cookies()).delete(LAST_ACTIVE_COOKIE);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
