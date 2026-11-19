/**
 * Layout for every system administrator page under `/admin`: wraps them in the app shell. Step 7 adds the check
 * that only system administrator accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps system administrator pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="admin">{children}</AppShell>;
}
