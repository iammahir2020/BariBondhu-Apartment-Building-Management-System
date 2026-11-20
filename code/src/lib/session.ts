/**
 * The app's own cookies, next to Supabase's: when the session was last used, for the idle limits (NFR-07), and
 * the device id and gate device marker for the wrong-password limit (BR-14). The log-in route sets them; the
 * middleware refreshes the last-active one on every request.
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

/** Cookie holding this browser's random device id, which wrong passwords are counted under (BR-14). */
export const DEVICE_COOKIE = 'bb_device';

/**
 * Cookie marking the shared gate device: set once a guard logs in on a browser. There, wrong passwords are counted
 * per username, so one guard can't lock out another (BR-14).
 */
export const GATE_DEVICE_COOKIE = 'bb_gate_device';

/** Longest life browsers allow a cookie: 400 days. */
const LONG_COOKIE_SECONDS = 400 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Keeps a well-formed device id, or makes a new one.
 * @param current - The cookie's value, if any.
 * @returns A device id.
 */
export function deviceIdFrom(current: string | undefined): string {
  return current && UUID_PATTERN.test(current) ? current : crypto.randomUUID();
}

/**
 * The device id cookie.
 * @param deviceId - The id to keep.
 * @returns Name, value and options, ready for `cookies.set`.
 */
export function deviceCookie(deviceId: string) {
  return {
    name: DEVICE_COOKIE,
    value: deviceId,
    ...BASE_COOKIE_OPTIONS,
    maxAge: LONG_COOKIE_SECONDS,
  };
}

/**
 * The gate device marker cookie.
 * @returns Name, value and options, ready for `cookies.set`.
 */
export function gateDeviceCookie() {
  return {
    name: GATE_DEVICE_COOKIE,
    value: '1',
    ...BASE_COOKIE_OPTIONS,
    maxAge: LONG_COOKIE_SECONDS,
  };
}

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
