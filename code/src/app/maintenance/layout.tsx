/**
 * Layout for every maintenance staff page under `/maintenance`: wraps them in the app shell. Step 7 adds the check
 * that only maintenance staff accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps maintenance staff pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function MaintenanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="maintenance">{children}</AppShell>;
}
