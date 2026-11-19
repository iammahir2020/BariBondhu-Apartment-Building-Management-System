/**
 * A role's navigation links, marking the current page. Shown as the bottom menu in the phone layout and as the
 * side menu in the desktop layout.
 *
 * @author Mahir Al Kamal
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isCurrentNavItem, type NavItem } from '@/lib/navigation';

/** Props for {@link RoleNav}. */
export interface RoleNavProps {
  /** Links to show. */
  items: readonly NavItem[];
  /** `bottom` for the phone layout, `side` for the desktop layout. */
  variant: 'bottom' | 'side';
  /** Accessible name of the menu, like "Main". */
  label: string;
}

/**
 * Renders a role's navigation links.
 * @param props - The links, layout variant and menu name.
 * @returns The navigation menu.
 */
export function RoleNav({ items, variant, label }: RoleNavProps) {
  const pathname = usePathname();

  if (variant === 'side') {
    return (
      <nav aria-label={label} className="flex flex-col gap-1">
        {items.map((item) => {
          const current = isCurrentNavItem(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium text-sidebar-foreground',
                current && 'bg-sidebar-accent font-bold text-sidebar-accent-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={label}
      className="sticky bottom-0 grid h-[68px] grid-cols-4 border-t border-border bg-card"
    >
      {items.map((item) => {
        const current = isCurrentNavItem(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center text-xs font-medium text-muted-foreground',
              current && 'font-bold text-primary',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
