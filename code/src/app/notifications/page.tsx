'use client';

/**
 * Lists the signed-in user's notifications and lets them mark notifications as read.
 *
 * @author Adika Rahman
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingRows } from '@/components/Loading';
import { callApi } from '@/lib/apiClient';

interface NotificationRow {
  id: string;
  text: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationRow[];
}

/** Formats the date and time shown on a notification. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The notifications page for every signed-in role.
 * @returns The user's notifications.
 */
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await callApi<NotificationsResponse>('/api/notifications/mine', 'GET');

    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setNotifications(result.data.notifications);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAsRead(notification: NotificationRow): Promise<void> {
    setBusyId(notification.id);
    setError(null);

    const result = await callApi(`/api/notifications/${notification.id}/read`, 'PATCH');

    setBusyId(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    await load();
  }

  const unreadCount = notifications.filter((item) => item.readAt === null).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Notifications</h1>
        <Badge variant={unreadCount > 0 ? 'warn' : 'ok'}>{unreadCount} unread</Badge>
      </div>

      <p className="text-sm text-muted-foreground">Messages and updates sent to your account.</p>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {loading ? (
        <LoadingRows label="Loading notifications..." />
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">You have no notifications.</p>
          </CardContent>
        </Card>
      ) : (
        notifications.map((notification) => (
          <Card key={notification.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{notification.text}</p>
                <Badge variant={notification.readAt === null ? 'warn' : 'secondary'}>
                  {notification.readAt === null ? 'Unread' : 'Read'}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground">{formatDate(notification.createdAt)}</p>

              <div className="flex flex-wrap gap-2">
                {notification.link !== null && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={notification.link}>View details</Link>
                  </Button>
                )}

                {notification.readAt === null && (
                  <Button
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => void markAsRead(notification)}
                  >
                    {busyId === notification.id ? 'Saving...' : 'Mark as read'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
