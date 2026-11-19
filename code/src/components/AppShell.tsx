/**
 * The frame around every signed-in page: a top bar with the role's name, and the page below it. Step 4 adds the
 * prototype's look, the Emergency button, the language switch, log out and each role's navigation.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/roles';

/** Props for {@link AppShell}. */
export interface AppShellProps {
  /** Role whose pages are inside the shell. */
  role: Role;
  /** The page. */
  children: ReactNode;
}

/**
 * Wraps a role's pages in the shared frame. Each role's `layout.tsx` uses it once.
 * @param props - The role and the page.
 * @returns The page inside the frame.
 */
export function AppShell({ role, children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3">
        <p className="font-semibold">{ROLE_LABELS[role]}</p>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
