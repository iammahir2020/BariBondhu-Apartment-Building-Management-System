/**
 * Tests for the bell's unread count, badge text and screen-reader label (BB-2304).
 *
 * @author Mahir Al Kamal
 */
import {
  BADGE_MAX,
  badgeText,
  bellLabel,
  unreadCount,
  type NotificationView,
} from './notificationView';

function note(id: string, readAt: string | null): NotificationView {
  return { id, text: `Note ${id}`, link: null, readAt, createdAt: '2026-11-28T12:00:00.000Z' };
}

describe('unreadCount', () => {
  it('counts only notifications without readAt', () => {
    expect(unreadCount([note('1', null), note('2', '2026-11-28T13:00:00Z'), note('3', null)])).toBe(
      2,
    );
  });

  it('is 0 for no notifications (boundary)', () => {
    expect(unreadCount([])).toBe(0);
  });
});

describe('badgeText', () => {
  it('shows nothing when all are read', () => {
    expect(badgeText(0)).toBeNull();
  });

  it('shows the number up to the maximum (boundary)', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(BADGE_MAX)).toBe(String(BADGE_MAX));
  });

  it('caps the badge above the maximum (boundary)', () => {
    expect(badgeText(BADGE_MAX + 1)).toBe(`${BADGE_MAX}+`);
  });

  it('shows nothing for a negative count (invalid)', () => {
    expect(badgeText(-1)).toBeNull();
  });
});

describe('bellLabel', () => {
  it('says how many are unread', () => {
    expect(bellLabel(2)).toBe('Notifications, 2 unread');
  });

  it('leaves the count out when none are unread', () => {
    expect(bellLabel(0)).toBe('Notifications');
  });
});
