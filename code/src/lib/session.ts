/**
 * The app's own session cookies, next to Supabase's: when the session was last used, for the idle limits
 * (NFR-07). The log-in route sets it and the middleware refreshes it on every request.
 *
 * @author Mahir Al Kamal
 */
import type { Role } from '@/lib/roles';
import { IDLE_LIMIT_MINUTES } from '@/services/authService';

/** Cookie holding the time of the session's last request, in ms since 1970. */
export const LAST_ACTIVE_COOKIE = 'bb_last_active';

/** Cookie options shared by the app's cookies: not readable by page scripts, sent only to this site. */
export const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/**
 * The last-active cookie for a request made now. It also expires on its own after the role's idle limit.
 * @param role - The user's role.
 * @param now - The current time.
 * @returns Name, value and options, ready for `cookies.set`.
 */
export function lastActiveCookie(role: Role, now: Date) {
  return {
    name: LAST_ACTIVE_COOKIE,
    value: String(now.getTime()),
    ...BASE_COOKIE_OPTIONS,
    maxAge: IDLE_LIMIT_MINUTES[role] * 60,
  };
}
