'use client';

/**
 * Notification bell shown in the shared app header.
 *
 * @author Adika Rahman
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { callApi } from '@/lib/apiClient';

interface NotificationItem {
  id: string;
  readAt: string | null;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
}

/**
 * Shows a bell with the current unread notification count.
 * @returns The notification link and unread count.
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    const result = await callApi<NotificationsResponse>('/api/notifications/mine', 'GET');

    if (!result.ok) return;

    setUnreadCount(result.data.notifications.filter((item) => item.readAt === null).length);
  }, []);

  useEffect(() => {
    void loadUnreadCount();
  }, [loadUnreadCount]);

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications, ${unreadCount} unread`}
      title="Notifications"
      className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
    >
      <Bell aria-hidden="true" className="size-5" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-5 text-destructive-foreground"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
