/**
 * Layout for every security guard page under `/guard`: only security guard accounts may open these pages (NFR-06); anyone else
 * is sent to their own home, and signed-out users to Log in. Wraps the pages in the app shell.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { requirePageRole } from '@/lib/auth';

/**
 * Checks the role, then wraps security guard pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default async function GuardLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requirePageRole('guard');
  return <AppShell role="guard">{children}</AppShell>;
}
