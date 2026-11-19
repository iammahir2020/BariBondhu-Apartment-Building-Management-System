/**
 * A role's navigation, marking the current page: the side menu on wide screens and the bottom menu on phones and
 * tablets. The app shell shows one or the other by screen width.
 *
 * @author Mahir Al Kamal
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isCurrentNavItem, NAV_SECTIONS, phoneNavItems, type NavItem } from '@/lib/navigation';
import type { Role } from '@/lib/roles';

/** Props for {@link SideNav}. */
export interface SideNavProps {
  /** Role whose sections to show. Passed as the role, not the links, because icons can't cross from server to
   * client components. */
  role: Role;
  /** Accessible name of the menu, like "Building manager". */
  label: string;
}

/**
 * The side menu: every section with its heading, on the dark sidebar.
 * @param props - The role and the menu's name.
 * @returns The side menu.
 */
export function SideNav({ role, label }: SideNavProps) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS[role];
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="flex flex-col gap-1">
          {section.title ? (
            <p className="px-3 pt-3.5 pb-1 text-[11px] font-bold tracking-[0.08em] text-[#8fb5af] uppercase">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => (
            <SideLink key={item.href} item={item} current={isCurrentNavItem(item.href, pathname)} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SideLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium text-sidebar-foreground',
        current && 'bg-sidebar-accent font-bold text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-5.5 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/** Props for {@link BottomNav}. */
export interface BottomNavProps {
  /** Role whose phone links to show (see `phoneNavItems`). */
  role: Role;
  /** Accessible name of the menu. */
  label: string;
  /** Extra classes, for example to hide it on wide screens. */
  className?: string;
}

/**
 * The bottom menu on phones and tablets: icon above label, one column per link.
 * @param props - The role, the menu's name and extra classes.
 * @returns The bottom menu.
 */
export function BottomNav({ role, label, className }: BottomNavProps) {
  const pathname = usePathname();
  const items = phoneNavItems(role);
  return (
    <nav
      aria-label={label}
      className={cn('sticky bottom-0 grid h-17 border-t border-border bg-card', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const current = isCurrentNavItem(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.75 text-xs font-medium text-muted-foreground',
              current && 'font-bold text-primary',
            )}
          >
            <Icon className="size-5.5" strokeWidth={current ? 2.4 : 2} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Props for {@link MoreMenu}. */
export interface MoreMenuProps {
  /** Role whose sections to list. */
  role: Role;
}

/**
 * The "More" page's content on phones: every section as a list of large links, like the prototype's
 * `M-More-Mobile`.
 * @param props - The role.
 * @returns The list of sections.
 */
export function MoreMenu({ role }: MoreMenuProps) {
  const sections = NAV_SECTIONS[role];
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, index) => (
        <section key={section.title ?? index} className="flex flex-col gap-2">
          {section.title ? (
            <h2 className="px-1 text-[13px] font-medium text-muted-foreground">{section.title}</h2>
          ) : null}
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href} className="border-b border-border last:border-b-0">
                  <Link
                    href={item.href}
                    className="flex min-h-14 items-center gap-3 px-4 font-bold"
                  >
                    <Icon className="size-5.5 text-primary" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
