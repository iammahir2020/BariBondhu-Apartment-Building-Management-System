/**
 * How in-app notifications are shown in the top bar's bell (BB-2304): the unread count on the badge and the label a
 * screen reader hears.
 *
 * @author Mahir Al Kamal
 */

/** A notification as `/api/notifications/mine` sends it, with times as ISO strings. */
export interface NotificationView {
  id: string;
  text: string;
  /** The page it opens, or null when it is only information. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Above this many unread, the badge shows "9+" so it stays one small circle. */
export const BADGE_MAX = 9;

/**
 * How many notifications are still unread.
 * @param notifications - My notifications.
 * @returns The number with no `readAt`.
 */
export function unreadCount(notifications: readonly NotificationView[]): number {
  return notifications.filter((item) => item.readAt === null).length;
}

/**
 * The text on the bell's badge.
 * @param count - Unread notifications.
 * @returns Nothing for 0, the number up to {@link BADGE_MAX}, then "9+".
 */
export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

/**
 * The bell's name for screen readers, with the unread count in words.
 * @param count - Unread notifications.
 * @returns Like "Notifications, 2 unread", or just "Notifications".
 */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${count} unread` : 'Notifications';
}
