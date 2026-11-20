/**
 * Supabase and database adapters for `accountService.ts`: create and remove Supabase users, and read and write
 * profiles. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import { profiles } from '@/models';
import type { AccountProfileStore, AuthUserAdmin } from '@/services/accountService';

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
