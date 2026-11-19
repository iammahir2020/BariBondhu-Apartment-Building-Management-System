/**
 * Each role's navigation links and which layout it uses. Feature owners add their page's link to their role's list
 * when they build the page.
 *
 * @author Mahir Al Kamal
 */
import type { Role } from '@/lib/roles';

/** One link in a role's navigation. */
export interface NavItem {
  /** Text on the link. */
  label: string;
  /** Page it opens, like `/resident/bills`. */
  href: string;
}

/**
 * Roles that work at a desk and get the desktop layout with a side menu, as in the prototype's `M-*` and `A-*`
 * screens. Every other role gets the phone layout with a bottom menu.
 */
export const DESKTOP_ROLES: ReadonlySet<Role> = new Set<Role>(['manager', 'admin']);

/**
 * Navigation links per role, in screen order. The phone layout's bottom menu fits four links.
 */
export const NAV_ITEMS: Readonly<Record<Role, readonly NavItem[]>> = {
  resident: [{ label: 'Home', href: '/resident' }],
  guard: [{ label: 'Home', href: '/guard' }],
  manager: [{ label: 'Dashboard', href: '/manager' }],
  committee: [{ label: 'Home', href: '/committee' }],
  maintenance: [{ label: 'Home', href: '/maintenance' }],
  admin: [{ label: 'Setup', href: '/admin' }],
};

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
