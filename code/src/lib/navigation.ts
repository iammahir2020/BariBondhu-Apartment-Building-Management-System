/**
 * Each role's navigation, used by the responsive app shell. On wide screens (1024 px and up) every section shows
 * in the side menu. On phones and tablets the bottom menu shows the links marked `onPhone`, and a "More" link to
 * `/<role>/more` is added when the role has links that don't fit there, as in the prototype's `M-More-Mobile`.
 *
 * Feature owners add their page's link to their role's sections when they build the page.
 *
 * @author Mahir Al Kamal
 */
import {
  Building2,
  Ellipsis,
  House,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Repeat,
  ScanLine,
  UserPlus,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/roles';

/** One link in a role's navigation. */
export interface NavItem {
  /** Text on the link. */
  label: string;
  /** Page it opens, like `/resident/bills`. */
  href: string;
  /** Icon shown next to the label. */
  icon: LucideIcon;
  /** Shown in the phone's bottom menu. Everything else is reached through More. */
  onPhone?: boolean;
}

/** A group of links in the side menu, like the manager's "Money" or "Building". */
export interface NavSection {
  /** Heading above the group; leave out for the first, untitled group. */
  title?: string;
  /** Links in screen order. */
  items: readonly NavItem[];
}

/** The bottom menu fits four links, as in the prototype. */
export const PHONE_NAV_LIMIT = 4;

/** Navigation sections per role, in screen order. */
export const NAV_SECTIONS: Readonly<Record<Role, readonly NavSection[]>> = {
  resident: [
    {
      items: [
        { label: 'Home', href: '/resident', icon: House, onPhone: true },
        { label: 'Dues', href: '/resident/dues', icon: Wallet, onPhone: true },
        { label: 'Guests', href: '/resident/guest-passes', icon: UserPlus, onPhone: true },
        { label: 'Tickets', href: '/resident/tickets', icon: Wrench, onPhone: true },
      ],
    },
    {
      title: 'More',
      items: [{ label: 'Report a fault', href: '/resident/report-fault', icon: Wrench }],
    },
  ],
  guard: [{ items: [{ label: 'Check a pass', href: '/guard', icon: ScanLine, onPhone: true }] }],
  manager: [
    {
      items: [
        { label: 'Dashboard', href: '/manager', icon: LayoutDashboard, onPhone: true },
        { label: 'Expenses', href: '/manager/expenses', icon: Wallet, onPhone: true },
        { label: 'Overpayments', href: '/manager/overpayments', icon: Repeat },
      ],
    },
  ],
  committee: [
    {
      items: [
        { label: 'Home', href: '/committee', icon: House, onPhone: true },
        { label: 'Rates', href: '/committee/rates', icon: Receipt, onPhone: true },
        { label: 'Expenses', href: '/committee/expenses', icon: Wallet, onPhone: true },
      ],
    },
  ],
  maintenance: [
    { items: [{ label: 'My tickets', href: '/maintenance', icon: ListChecks, onPhone: true }] },
  ],
  admin: [{ items: [{ label: 'Building setup', href: '/admin', icon: Building2, onPhone: true }] }],
};

/**
 * Every link of a role, in screen order, ignoring sections.
 * @param role - The signed-in user's role.
 * @returns All the role's links.
 */
export function allNavItems(role: Role): NavItem[] {
  return NAV_SECTIONS[role].flatMap((section) => section.items);
}

/**
 * Links for the phone's bottom menu: the ones marked `onPhone`, plus "More" when some links don't fit. With More,
 * only three phone links are kept so the menu still has four places.
 * @param role - The signed-in user's role.
 * @param all - The role's links; defaults to {@link allNavItems}. Tests pass longer lists.
 * @returns At most {@link PHONE_NAV_LIMIT} links.
 */
export function phoneNavItems(role: Role, all: readonly NavItem[] = allNavItems(role)): NavItem[] {
  const onPhone = all.filter((item) => item.onPhone);
  const needsMore = onPhone.length < all.length || onPhone.length > PHONE_NAV_LIMIT;
  if (!needsMore) return onPhone;
  const more: NavItem = { label: 'More', href: `/${role}/more`, icon: Ellipsis };
  return [...onPhone.slice(0, PHONE_NAV_LIMIT - 1), more];
}

/**
 * Checks whether a nav link is the page being shown. A role's home link only matches exactly, so it isn't marked
 * on every page of that role.
 * @param href - The link's address.
 * @param pathname - The current page's address.
 * @returns True when the link should show as current.
 */
export function isCurrentNavItem(href: string, pathname: string): boolean {
  const isRoleHome = href.split('/').filter(Boolean).length === 1;
  return isRoleHome ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
