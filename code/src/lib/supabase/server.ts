/**
 * Supabase client for API routes and server components. It reads and writes the session cookies through Next's
 * cookie store, so signing in or out in a route sets or clears the browser's session.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { requireEnv } from '@/lib/env';

/**
 * Creates a Supabase client bound to this request's cookies.
 * @returns The client; use `client.auth` for sign-in, sign-out and password changes.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server components can't set cookies; the middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/** The client returned by {@link createSupabaseServerClient}. */
export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Creates a read-only Supabase client from a request's `Cookie` header, for checking who sent it. It never writes
 * cookies: the middleware has already refreshed the session before the route runs.
 * @param request - The incoming request.
 * @returns The client.
 */
export function createSupabaseRequestClient(request: Request): SupabaseServerClient {
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () =>
          parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({
            name,
            value: value ?? '',
          })),
        setAll: () => {},
      },
    },
  );
}
