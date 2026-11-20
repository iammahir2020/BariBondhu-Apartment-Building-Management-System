/**
 * The frame around every signed-in page, responsive for every role, following the prototype's two views of each
 * screen (`X.html` and `X-Web.html` / `X-Mobile.html` in `docs/ui-prototype/`):
 *
 * - Phones and tablets (under 1024 px): top bar, the page, and a bottom menu with More when needed.
 * - Laptops (1024 px and up): dark side menu with every section, top bar, and a wider page.
 *
 * Both show the role's name, the Bangla/English switch, Emergency and Log out. The language switch is a placeholder
 * until the Bangla feature is built.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, Phone } from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { Button } from '@/components/ui/button';
import { BottomNav, SideNav } from '@/components/RoleNav';
import { ROLE_LABELS, type Role } from '@/lib/roles';

/** Props for {@link AppShell}. */
export interface AppShellProps {
  /** Role whose pages are inside the shell. */
  role: Role;
  /** The page. */
  children: ReactNode;
}

/**
 * Wraps a role's pages in the shared, responsive frame. Each role's `layout.tsx` uses it once.
 * @param props - The role and the page.
 * @returns The page inside the frame.
 */
export function AppShell({ role, children }: AppShellProps) {
  const roleLabel = ROLE_LABELS[role];
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 overflow-y-auto bg-sidebar px-3.5 py-5 text-sidebar-foreground lg:flex">
        <div className="px-2 pb-1">
          <Brand label="BariBondhu" inverted />
        </div>
        <p className="pb-3.5 pl-12.5 text-[13px] text-[#8fb5af]">{roleLabel}</p>
        <SideNav role={role} label={roleLabel} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card pr-2 pl-4 lg:h-17 lg:gap-3 lg:px-7">
          <div className="min-w-0 flex-1 lg:hidden">
            <Brand label={roleLabel} />
          </div>
          <p className="hidden flex-1 text-[22px] font-bold lg:block">{roleLabel}</p>
          <TopBarActions />
        </header>
        <main className="flex w-full flex-1 flex-col gap-4 p-4 lg:max-w-295 lg:gap-5 lg:px-7 lg:py-6">
          {children}
        </main>
        <BottomNav role={role} label="Main" className="lg:hidden" />
      </div>
    </div>
  );
}

/** Logo tile and a name next to it. The logo is left out on phones to keep room for the name. */
function Brand({ label, inverted = false }: { label: string; inverted?: boolean }) {
  return (
    <div
      className={
        inverted
          ? 'flex items-center gap-2.5 text-[17px] font-bold text-white'
          : 'flex min-w-0 items-center gap-2.5 text-[17px] font-bold text-primary'
      }
    >
      <span
        className={
          inverted
            ? 'grid size-8 shrink-0 place-items-center rounded-[9px] bg-white text-brand-900'
            : 'hidden size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground sm:grid'
        }
        aria-hidden="true"
      >
        <Building2 className="size-4.75" />
      </span>
      <span className="truncate" title={label}>
        {label}
      </span>
    </div>
  );
}

/** Language switch, Emergency and Log out. Log out shows its text only on wide screens. */
function TopBarActions() {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-full border border-border bg-card text-sm font-semibold text-foreground"
        lang="bn"
        aria-label="বাং: Switch to Bangla (coming soon)"
        title="Bangla is coming soon"
        disabled
      >
        বাং
      </Button>
      {/* On phones (under 640 px) the button is round with only the phone icon, like the prototype's `.sos.round`, so the
          role's name keeps its room; the text stays for screen readers. */}
      <Button
        asChild
        variant="destructive"
        size="sm"
        className="shrink-0 rounded-full max-sm:size-12 max-sm:px-0"
      >
        <Link href="/emergency" prefetch={false}>
          <Phone aria-hidden="true" />
          <span className="max-sm:sr-only">Emergency</span>
        </Link>
      </Button>
      <LogoutButton />
    </>
  );
}
