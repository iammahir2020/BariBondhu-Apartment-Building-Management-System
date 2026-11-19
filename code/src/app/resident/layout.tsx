/**
 * Layout for every resident page under `/resident`: wraps them in the app shell. Step 7 adds the check
 * that only resident accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps resident pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function ResidentLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="resident">{children}</AppShell>;
}
