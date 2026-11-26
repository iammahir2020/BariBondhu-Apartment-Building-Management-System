/**
 * Tests for the phone's bottom menu: at most four places, "More" when links don't fit, and which link is current.
 *
 * @author Mahir Al Kamal
 */
import { House } from 'lucide-react';
import {
  PHONE_NAV_LIMIT,
  allNavItems,
  isCurrentNavItem,
  phoneNavItems,
  type NavItem,
} from '@/lib/navigation';
import { ROLES } from '@/lib/roles';

function links(count: number, onPhone: number): NavItem[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `Link ${i + 1}`,
    href: `/manager/link-${i + 1}`,
    icon: House,
    onPhone: i < onPhone,
  }));
}

describe('phoneNavItems', () => {
  it.each(ROLES)(
    'gives %s at most four places: its phone links, and More if some links are not on the phone',
    (role) => {
      const all = allNavItems(role);
      const phone = all.filter((item) => item.onPhone);
      const more = phone.length < all.length ? [`/${role}/more`] : [];
      const shown = more.length > 0 ? phone.slice(0, PHONE_NAV_LIMIT - 1) : phone;
      const items = phoneNavItems(role);
      expect(items.length).toBeLessThanOrEqual(PHONE_NAV_LIMIT);
      expect(items.map((item) => item.href)).toEqual([...shown.map((item) => item.href), ...more]);
    },
  );

  it('keeps four phone links when every link is on the phone (boundary, no More)', () => {
    const items = phoneNavItems('manager', links(4, 4));
    expect(items.map((item) => item.label)).toEqual(['Link 1', 'Link 2', 'Link 3', 'Link 4']);
  });

  it('adds More after three links when a fifth phone link would not fit (boundary)', () => {
    const items = phoneNavItems('manager', links(5, 5));
    expect(items).toHaveLength(PHONE_NAV_LIMIT);
    expect(items.map((item) => item.label)).toEqual(['Link 1', 'Link 2', 'Link 3', 'More']);
    expect(items[3]?.href).toBe('/manager/more');
  });

  it('adds More when some links are only on the laptop menu', () => {
    const items = phoneNavItems('resident', links(3, 2));
    expect(items.map((item) => item.label)).toEqual(['Link 1', 'Link 2', 'More']);
    expect(items[2]?.href).toBe('/resident/more');
  });

  it('keeps Tickets on the manager phone menu before More', () => {
    expect(phoneNavItems('manager').map((item) => item.label)).toEqual([
      'Dashboard',
      'Bills',
      'Tickets',
      'More',
    ]);
  });

  it('returns no links for a role with none (exception)', () => {
    expect(phoneNavItems('admin', [])).toEqual([]);
  });
});

describe('isCurrentNavItem', () => {
  it('marks a role home only on the home itself', () => {
    expect(isCurrentNavItem('/manager', '/manager')).toBe(true);
    expect(isCurrentNavItem('/manager', '/manager/bills')).toBe(false);
  });

  it('marks a section for its own page and pages under it', () => {
    expect(isCurrentNavItem('/manager/bills', '/manager/bills')).toBe(true);
    expect(isCurrentNavItem('/manager/bills', '/manager/bills/123')).toBe(true);
  });

  it('does not mark a section whose name only starts the same (boundary)', () => {
    expect(isCurrentNavItem('/manager/bills', '/manager/bills-archive')).toBe(false);
  });
});
