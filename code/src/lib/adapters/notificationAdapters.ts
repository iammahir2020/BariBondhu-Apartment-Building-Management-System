/**
 * Database adapters for notificationService.ts and the shared Notifier. They read, update and create notifications.
 *
 * @author Adika Rahman
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { notifications } from '@/models/Notification';
import type { NotificationStore } from '@/services/notificationService';
import type { Notifier } from '@/services/notifier';

/**
 * Creates a notification store backed by the notifications table.
 * @param db - Database connection.
 * @returns Notification storage operations.
 */
export function databaseNotificationStore(db: Database): NotificationStore {
  return {
    async listByRecipient(recipientId) {
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, recipientId))
        .orderBy(desc(notifications.createdAt));
    },

    async markAsRead(recipientId, notificationId, readAt) {
      const [updated] = await db
        .update(notifications)
        .set({ readAt })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.recipientId, recipientId),
            isNull(notifications.readAt),
          ),
        )
        .returning();

      if (updated) return updated;

      // Preserve the original readAt when the notification was already read.
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.id, notificationId), eq(notifications.recipientId, recipientId)),
        )
        .limit(1);

      return rows[0];
    },
  };
}

/**
 * Saves an in-app notification for its recipient.
 * @param db - Database connection.
 * @returns A notifier that writes to the notifications table.
 * @author Jannatul Ferdus Nishi
 */
export function databaseNotifier(db: Database): Notifier {
  return async ({ recipientId, text, link }) => {
    await db.insert(notifications).values({
      recipientId,
      text,
      link: link ?? null,
    });
  };
}
