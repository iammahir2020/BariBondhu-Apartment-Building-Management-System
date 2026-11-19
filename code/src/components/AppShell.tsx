/**
 * The frame around every signed-in page, copied from the UI prototype. Phone roles (resident, guard, committee,
 * maintenance) get a top bar and a bottom menu; desk roles (manager, admin) get a side menu and a top bar. Both
 * show the role's name, the Emergency button, the Bangla/English switch and Log out.
 *
 * The language switch and Log out are placeholders until login (step 6) and the Bangla feature are built.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, LogOut, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoleNav } from '@/components/RoleNav';
import { DESKTOP_ROLES, NAV_ITEMS } from '@/lib/navigation';
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
  return DESKTOP_ROLES.has(role) ? (
    <DesktopShell role={role}>{children}</DesktopShell>
  ) : (
    <PhoneShell role={role}>{children}</PhoneShell>
  );
}

/** Phone layout: top bar, page, bottom menu. Centred and kept phone-width on large screens. */
function PhoneShell({ role, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card pr-2 pl-4">
        <Brand label={ROLE_LABELS[role]} />
        <span className="flex-1" />
        <TopBarActions compact />
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      <RoleNav items={NAV_ITEMS[role]} variant="bottom" label="Main" />
    </div>
  );
}

/** Desktop layout: dark side menu on the left, top bar and page on the right. */
function DesktopShell({ role, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col gap-1 bg-sidebar px-3.5 py-5 text-sidebar-foreground">
        <div className="px-2 pb-4">
          <Brand label="BariBondhu" inverted />
        </div>
        <RoleNav items={NAV_ITEMS[role]} variant="side" label={ROLE_LABELS[role]} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
          <p className="flex-1 text-lg font-bold">{ROLE_LABELS[role]}</p>
          <TopBarActions />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-6">{children}</main>
      </div>
    </div>
  );
}

/** Logo tile and a name next to it. */
function Brand({ label, inverted = false }: { label: string; inverted?: boolean }) {
  return (
    <div
      className={
        inverted
          ? 'flex items-center gap-2.5 text-[17px] font-bold text-white'
          : 'flex min-w-0 items-center gap-2.5 truncate text-[17px] font-bold text-primary'
      }
    >
      <span
        className={
          inverted
            ? 'grid size-8 place-items-center rounded-[9px] bg-white text-brand-900'
            : 'grid size-8 place-items-center rounded-[9px] bg-primary text-primary-foreground'
        }
        aria-hidden="true"
      >
        <Building2 className="size-4.75" />
      </span>
      {label}
    </div>
  );
}

/**
 * Language switch, Emergency and Log out. `compact` drops the text on Log out to fit a phone's top bar.
 */
function TopBarActions({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full border border-border bg-card text-sm font-semibold text-foreground"
        lang="bn"
        aria-label="বাং: Switch to Bangla (coming soon)"
        title="Bangla is coming soon"
        disabled
      >
        বাং
      </Button>
      <Button asChild variant="destructive" size="sm" className="rounded-full">
        <Link href="/emergency" prefetch={false}>
          <Phone aria-hidden="true" />
          Emergency
        </Link>
      </Button>
      <Button
        variant="ghost"
        size={compact ? 'icon' : 'sm'}
        aria-label="Log out (coming with login)"
        title="Log out comes with login"
        disabled
      >
        <LogOut aria-hidden="true" />
        {compact ? null : 'Log out'}
      </Button>
    </>
  );
}
