/**
 * Notification database model for in-app messages sent to individual profiles.
 *
 * @author Adika Rahman
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** Notifications delivered to a profile. */
export const notifications = pgTable(
  'notifications',
  {
    /** Unique notification ID. */
    id: uuid().primaryKey().defaultRandom(),
    /** Profile receiving the notification. */
    recipientId: uuid()
      .notNull()
      .references(() => profiles.id),
    /** Notification message. */
    text: text().notNull(),
    /** Optional destination link. */
    link: text(),
    /** When the notification was read. */
    readAt: timestamp({ withTimezone: true }),
    /** When it was sent: the list shows newest first (BB-2303). */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_recipient_id_idx').on(table.recipientId, table.createdAt)],
).enableRLS();

/** Notification record returned from the database. */
export type Notification = typeof notifications.$inferSelect;

/** Fields used to insert a notification. */
export type NewNotification = typeof notifications.$inferInsert;
