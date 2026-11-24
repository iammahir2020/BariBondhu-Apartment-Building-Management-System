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
    id: uuid().primaryKey().defaultRandom(),

    recipientId: uuid()
      .notNull()
      .references(() => profiles.id),

    text: text().notNull(),

    link: text(),

    readAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('notifications_recipient_id_idx').on(table.recipientId)],
).enableRLS();

/** Notification record returned from the database. */
export type Notification = typeof notifications.$inferSelect;

/** Fields used to insert a notification. */
export type NewNotification = typeof notifications.$inferInsert;
