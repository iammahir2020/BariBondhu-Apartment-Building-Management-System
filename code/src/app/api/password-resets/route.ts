/**
 * Password resets (BR-15): ask for a reset link (POST) and choose a new password with it (PUT). Both are for
 * signed-out users, so there is no role check here.
 *
 * @author Mahir Al Kamal
 */
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { requireEnv } from '@/lib/env';
import { toErrorResponse } from '@/lib/errors';
import { smtpEmailSender } from '@/lib/mailer';
import { readJsonObject, requireString } from '@/lib/parse';
import { lastActiveCookie } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { databaseAuditWriter } from '@/services/auditService';
import { databaseProfileFinder } from '@/services/authService';
import {
  databaseProfileByUsername,
  requestPasswordReset,
  resetPassword,
  supabaseRecoveryTokens,
} from '@/services/passwordResetService';
import { databasePasswordProfileStore, supabasePasswordUpdater } from '@/services/passwordService';

/**
 * Sends a reset link for `{ username }`.
 * @param request - The request.
 * @returns 200 with `{ sent: true, maskedEmail }` or `{ sent: false }` (no email on the account), or an error.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const username = requireString(body, 'username', 'username');
    const supabase = await createSupabaseServerClient();
    const result = await requestPasswordReset(
      {
        profiles: databaseProfileByUsername(db),
        tokens: supabaseRecoveryTokens(getSupabaseAdmin(), supabase),
        sendEmail: smtpEmailSender(),
      },
      username,
      requireEnv('APP_URL'),
    );
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Sets a new password from `{ token, password }` and signs the user in.
 * @param request - The request.
 * @returns 200 with `{ home }`, or an error (400 rule broken or link invalid, 403 deactivated).
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const token = requireString(body, 'token', 'reset link');
    const password = requireString(body, 'password', 'new password', { trim: false });
    const supabase = await createSupabaseServerClient();
    const profile = await resetPassword(
      {
        tokens: supabaseRecoveryTokens(getSupabaseAdmin(), supabase),
        profiles: { ...databaseProfileFinder(db), ...databasePasswordProfileStore(db) },
        passwords: supabasePasswordUpdater(supabase),
        audit: databaseAuditWriter(db),
      },
      token,
      password,
    );
    (await cookies()).set(lastActiveCookie(profile.role, new Date()));
    return Response.json({ home: `/${profile.role}` });
  } catch (error) {
    return toErrorResponse(error);
  }
}
