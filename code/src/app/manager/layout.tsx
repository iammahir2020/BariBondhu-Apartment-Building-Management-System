/**
 * Layout for every building manager page under `/manager`: wraps them in the app shell. Step 7 adds the check
 * that only building manager accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps building manager pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function ManagerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="manager">{children}</AppShell>;
}
