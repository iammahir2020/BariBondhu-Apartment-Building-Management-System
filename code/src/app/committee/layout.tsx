/**
 * Layout for every committee member page under `/committee`: wraps them in the app shell. Step 7 adds the check
 * that only committee member accounts can open these pages.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Wraps committee member pages in the shared frame.
 * @param props - The page to wrap.
 * @returns The page inside the app shell.
 */
export default function CommitteeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell role="committee">{children}</AppShell>;
}
