/**
 * Database adapter for notificationService.ts. Reads and updates only the recipient's notifications.
 *
 * @author Adika Rahman
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { notifications } from '@/models/Notification';
import type { NotificationStore } from '@/services/notificationService';

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
