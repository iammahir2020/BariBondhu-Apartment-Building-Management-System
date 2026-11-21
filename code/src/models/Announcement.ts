/**
 * Announcement database model for BM-11 and RES-08.
 * Supports all residents, one block, or one floor.
 *
 * @author Jannatul Ferdus Nishi
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { blocks } from './Block';
import { profiles } from './Profile';

/** States from the Announcement state diagram. */
export const announcementStatusEnum = pgEnum('announcement_status', ['Published', 'Removed']);

/** Available announcement audience types. */
export const announcementAudienceEnum = pgEnum('announcement_audience', ['All', 'Block', 'Floor']);

/** Type of announcement status. */
export type AnnouncementStatus = (typeof announcementStatusEnum.enumValues)[number];

/** Type of announcement audience. */
export type AnnouncementAudience = (typeof announcementAudienceEnum.enumValues)[number];

/** Announcements created by a Building Manager. */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid().primaryKey().defaultRandom(),

    title: text().notNull(),
    message: text().notNull(),

    audience: announcementAudienceEnum().notNull().default('All'),

    targetBlockId: uuid().references(() => blocks.id),
    targetFloor: integer(),

    urgent: boolean().notNull().default(false),
    expiresAt: timestamp({ withTimezone: true }),

    status: announcementStatusEnum().notNull().default('Published'),

    createdById: uuid()
      .notNull()
      .references(() => profiles.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('announcements_title_not_blank', sql`length(trim(${table.title})) > 0`),
    check('announcements_message_not_blank', sql`length(trim(${table.message})) > 0`),
    check(
      'announcements_audience_target',
      sql`(
        (${table.audience} = 'All'
          AND ${table.targetBlockId} IS NULL
          AND ${table.targetFloor} IS NULL)
        OR
        (${table.audience} = 'Block'
          AND ${table.targetBlockId} IS NOT NULL
          AND ${table.targetFloor} IS NULL)
        OR
        (${table.audience} = 'Floor'
          AND ${table.targetBlockId} IS NULL
          AND ${table.targetFloor} IS NOT NULL)
      )`,
    ),
    check(
      'announcements_urgent_expiry',
      sql`NOT ${table.urgent}
          OR ${table.expiresAt} IS NOT NULL`,
    ),
    index('announcements_status_idx').on(table.status),
    index('announcements_audience_idx').on(table.audience),
  ],
).enableRLS();

/** Announcement record returned from the database. */
export type Announcement = typeof announcements.$inferSelect;

/** Fields used to insert an announcement. */
export type NewAnnouncement = typeof announcements.$inferInsert;
