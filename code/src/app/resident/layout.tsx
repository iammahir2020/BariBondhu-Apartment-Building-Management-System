/**
 * Layout for every resident page under `/resident`: only resident accounts may open these pages (NFR-06); anyone else
 * is sent to their own home, and signed-out users to Log in. Wraps the pages in the app shell.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { requirePageRole } from '@/lib/auth';

/**
 * Checks the role, then wraps resident pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default async function ResidentLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requirePageRole('resident');
  return <AppShell role="resident">{children}</AppShell>;
}
