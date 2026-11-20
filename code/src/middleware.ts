/**
 * Runs before every page and API request: refreshes the Supabase session, ends sessions that were idle too long
 * (NFR-07) or belong to a deactivated account, sends signed-out users to Log in, keeps users with a temporary
 * password on Set new password (BR-15), and sends signed-in users from Log in or `/` to their role's home. API routes still check the role themselves (step 7, NFR-06).
 *
 * @author Mahir Al Kamal
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { db } from '@/lib/db';
import { requireEnv } from '@/lib/env';
import { LAST_ACTIVE_COOKIE, lastActiveCookie } from '@/lib/session';
import { databaseProfileFinder, isIdleExpired } from '@/services/authService';

/** Pages anyone can open without logging in. */
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password', '/emergency'];

/**
 * Checks the session and decides where the request goes.
 * @param request - The incoming request.
 * @returns The response to continue with, or a redirect.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api/');
  const now = new Date();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let profile = user ? await databaseProfileFinder(db).findById(user.id) : undefined;
  let endedForIdle = false;

  if (user && profile) {
    const lastActive = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value ?? NaN);
    const loggingIn = path === '/api/sessions' && request.method === 'POST';
    const idle = isIdleExpired(profile.role, lastActive, now);
    if (!loggingIn && (!profile.active || idle)) {
      await supabase.auth.signOut({ scope: 'local' });
      response.cookies.delete(LAST_ACTIVE_COOKIE);
      endedForIdle = profile.active && idle;
      profile = undefined;
    } else {
      response.cookies.set(lastActiveCookie(profile.role, now));
    }
  }

  if (isApi) return response;

  const isPublic = PUBLIC_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
  if (!profile) {
    if (isPublic && !endedForIdle) return response;
    return redirect(request, response, endedForIdle ? '/login?reason=idle' : '/login');
  }
  // A temporary password must be replaced before anything else (BR-15).
  if (profile.mustChangePassword) {
    return path === '/set-password' ? response : redirect(request, response, '/set-password');
  }
  if (path === '/' || path === '/login' || path === '/set-password') {
    return redirect(request, response, `/${profile.role}`);
  }
  return response;
}

/** Redirects while keeping any cookies the session refresh set on `response`. */
function redirect(request: NextRequest, response: NextResponse, path: string): NextResponse {
  const target = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

/** Runs on Node.js (for the database client), on everything except Next's files and static assets. */
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
