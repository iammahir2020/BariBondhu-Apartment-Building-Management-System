/**
 * Shared layout for notifications. Every active signed-in role may view their own notifications.
 *
 * @author Adika Rahman
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireCurrentProfile } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Checks the signed-in profile and wraps the page in the shared app shell.
 * @param props - The page to wrap.
 * @returns The notifications page inside the app shell.
 */
export default async function NotificationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const profile = await requireCurrentProfile(await createSupabaseServerClient());

  if (profile.mustChangePassword) redirect('/set-password');

  return <AppShell role={profile.role}>{children}</AppShell>;
}
