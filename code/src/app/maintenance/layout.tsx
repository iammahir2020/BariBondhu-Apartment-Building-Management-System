/**
 * Layout for every maintenance staff page under `/maintenance`: only maintenance staff accounts may open these pages (NFR-06); anyone else
 * is sent to their own home, and signed-out users to Log in. Wraps the pages in the app shell.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { requirePageRole } from '@/lib/auth';

/**
 * Checks the role, then wraps maintenance staff pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default async function MaintenanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requirePageRole('maintenance');
  return <AppShell role="maintenance">{children}</AppShell>;
}
