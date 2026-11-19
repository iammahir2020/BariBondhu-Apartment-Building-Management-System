/**
 * Layout for every security guard page under `/guard`: wraps them in the app shell. Step 7 adds the check
 * that only security guard accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps security guard pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function GuardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="guard">{children}</AppShell>;
}
