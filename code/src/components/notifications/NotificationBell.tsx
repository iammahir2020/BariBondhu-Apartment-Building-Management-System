'use client';

/**
 * The bell in every role's top bar (BB-2304): a badge with the unread count, and a panel listing my notifications,
 * newest first. Tapping one marks it read and opens its page, like the ticket status changes that send residents to
 * Repairs (RES-02) and new reports that send the manager to Tickets (BM-06).
 *
 * @author Mahir Al Kamal
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatPassMoment } from '@/components/guestPasses/passView';
import { callApi } from '@/lib/apiClient';
import { badgeText, bellLabel, unreadCount, type NotificationView } from './notificationView';

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; notifications: NotificationView[] };

/** One notification: a link when it has a page, plain text otherwise. Unread ones are bold with a dot. */
function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationView;
  onOpen: (item: NotificationView) => void;
}) {
  const unread = item.readAt === null;
  const body = (
    <>
      <span
        className={`mt-2 size-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className={`block wrap-break-word ${unread ? 'font-semibold' : ''}`}>
          {item.text}
          {unread && <span className="sr-only"> (unread)</span>}
        </span>
        <span className="block text-sm text-muted-foreground">
          {formatPassMoment(item.createdAt)}
        </span>
      </span>
    </>
  );
  const className = 'flex min-h-12 w-full items-start gap-3 px-1 py-3 text-left';
  return (
    <li>
      {item.link ? (
        <Link href={item.link} className={className} onClick={() => onOpen(item)}>
          {body}
        </Link>
      ) : (
        <button type="button" className={className} onClick={() => onOpen(item)}>
          {body}
        </button>
      )}
    </li>
  );
}

/**
 * The bell with its unread badge and the notifications panel.
 * @returns The bell button.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  const load = useCallback(async () => {
    const result = await callApi<{ notifications: NotificationView[] }>(
      '/api/notifications/mine',
      'GET',
    );
    setLoaded(
      result.ok
        ? { state: 'ready', notifications: result.data.notifications }
        : { state: 'error', message: result.error.message },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Opening the panel reloads, so it shows what arrived since the page loaded. */
  function changeOpen(next: boolean): void {
    setOpen(next);
    if (next) void load();
  }

  /** Marks the notification read (here at once, and on the server) and closes the panel. */
  function openItem(item: NotificationView): void {
    setOpen(false);
    if (item.readAt !== null) return;
    const readAt = new Date().toISOString();
    setLoaded((current) =>
      current.state === 'ready'
        ? {
            state: 'ready',
            notifications: current.notifications.map((n) =>
              n.id === item.id ? { ...n, readAt } : n,
            ),
          }
        : current,
    );
    void callApi(`/api/notifications/${encodeURIComponent(item.id)}/read`, 'PATCH');
  }

  const count = loaded.state === 'ready' ? unreadCount(loaded.notifications) : 0;
  const badge = badgeText(count);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0 rounded-full border border-border bg-card max-sm:size-12"
          aria-label={bellLabel(count)}
        >
          <Bell aria-hidden="true" />
          {badge && (
            <span
              className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs leading-5 font-bold text-white"
              aria-hidden="true"
            >
              {badge}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Notifications</DialogTitle>
          <DialogDescription>Newest first. Tap one to open it.</DialogDescription>
        </DialogHeader>
        {loaded.state === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
        {loaded.state === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {loaded.message}
          </p>
        )}
        {loaded.state === 'ready' && loaded.notifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {loaded.state === 'ready' && loaded.notifications.length > 0 && (
          <ul className="divide-y divide-border">
            {loaded.notifications.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={openItem} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
