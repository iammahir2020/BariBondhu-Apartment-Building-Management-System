/**
 * Layout for every committee member page under `/committee`: only committee member accounts may open these pages (NFR-06); anyone else
 * is sent to their own home, and signed-out users to Log in. Wraps the pages in the app shell.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { requirePageRole } from '@/lib/auth';

/**
 * Checks the role, then wraps committee member pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default async function CommitteeLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requirePageRole('committee');
  return <AppShell role="committee">{children}</AppShell>;
}
