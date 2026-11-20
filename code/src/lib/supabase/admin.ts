/**
 * Supabase admin client, using the service-role key: creates accounts and makes password reset links. It can do
 * anything to any user, so it is server only and never reaches the browser.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

let client: SupabaseClient | undefined;

/**
 * Returns the shared admin client, creating it on first use.
 * @returns The admin client; use `client.auth.admin`.
 */
export function getSupabaseAdmin(): SupabaseClient {
  client ??= createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return client;
}
