/**
 * The signed-in user's password: set a new one, at first log-in in place of the temporary password (BR-15). Every
 * role may change its own password, so the only check is that someone is signed in.
 *
 * @author Mahir Al Kamal
 */
import { requireCurrentProfile } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { databaseAuditWriter } from '@/services/auditService';
import {
  databasePasswordProfileStore,
  setOwnPassword,
  supabasePasswordUpdater,
} from '@/services/passwordService';

/**
 * Sets a new password from `{ password }`.
 * @param request - The request.
 * @returns 200 with `{ home }`, or an error (400 rule broken, 401 not signed in).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const profile = await requireCurrentProfile(supabase);
    const body = await readJsonObject(request);
    const password = requireString(body, 'password', 'new password', { trim: false });

    await setOwnPassword(
      {
        passwords: supabasePasswordUpdater(supabase),
        profiles: databasePasswordProfileStore(db),
        audit: databaseAuditWriter(db),
      },
      profile.id,
      password,
    );
    return Response.json({ home: `/${profile.role}` });
  } catch (error) {
    return toErrorResponse(error);
  }
}
