/**
 * A fault ticket: a problem inside a flat or in a common area, reported by a resident (RES-02) or found by a
 * maintenance worker during a repair (MNT-05), then assigned, worked on and closed (BM-06, BM-07, MNT-01 to MNT-03).
 * Who may move a ticket between states is decided in the ticket service, not here.
 *
 * @author Mahir Al Kamal
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { commonAreaPlaces } from './CommonAreaPlace';
import { flats } from './Flat';
import { occupancies } from './Occupancy';
import { profiles } from './Profile';

/**
 * Ticket states, word for word from the ticket state diagram in `docs/sds/design-inputs-from-srs.md`.
 * Closed, Cancelled, Duplicate and Won't fix are final.
 */
export const ticketStatusEnum = pgEnum('ticket_status', [
  'Reported',
  'Assigned',
  'In progress',
  'On hold',
  'Fixed',
  'Closed',
  'Cancelled',
  'Duplicate',
  "Won't fix",
]);

/** One of the nine ticket states. */
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];

/**
 * Fault categories, from the Report a fault screen. "Fire or gas smell" is the emergency category that shows the
 * emergency numbers first (BR-12); someone stuck in a lift is logged as Lift with Urgent priority.
 */
export const ticketCategoryEnum = pgEnum('ticket_category', [
  'Plumbing',
  'Electrical',
  'Lift',
  'Water supply',
  'Fire or gas smell',
  'Other',
]);

/** One of the fault categories. */
export type TicketCategory = (typeof ticketCategoryEnum.enumValues)[number];

/** Ticket priority: set by the manager when assigning (BM-06), or Urgent from the emergency path (RES-02). */
export const ticketPriorityEnum = pgEnum('ticket_priority', ['Urgent', 'High', 'Normal']);

/** One of the three priorities. */
export type TicketPriority = (typeof ticketPriorityEnum.enumValues)[number];

/** Tickets: each is either inside one flat or in one common-area place, never both. */
export const tickets = pgTable(
  'tickets',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The profile that reported it: the household's resident profile, or the maintenance worker (MNT-05). */
    reportedById: uuid()
      .notNull()
      .references(() => profiles.id),
    /** The reporting household; empty when found by staff. Keeps the ticket with that household's history (BR-09). */
    occupancyId: uuid().references(() => occupancies.id),
    category: ticketCategoryEnum().notNull(),
    /** Set for a fault inside a flat. */
    flatId: uuid().references(() => flats.id),
    /** Set for a common-area fault (BR-13). */
    placeId: uuid().references(() => commonAreaPlaces.id),
    /** Short title. Found-by-staff tickets may have none (MNT-05 asks only for category, description and place). */
    title: text(),
    description: text().notNull(),
    /** Path of the photo in Supabase Storage (JPG or PNG, at most 5 MB, NFR-09). */
    photoPath: text(),
    /** When someone is home, as the resident wrote it ("Weekdays after 5 pm"). */
    homeTimes: text(),
    status: ticketStatusEnum().notNull().default('Reported'),
    priority: ticketPriorityEnum().notNull().default('Normal'),
    /** The maintenance worker it is assigned to (BM-06). Reassigning keeps the status. */
    assigneeId: uuid().references(() => profiles.id),
    dueDate: date(),
    /** The manager's instructions to the maintenance worker (BM-06, MNT-02). */
    instructions: text(),
    /** Reported by a maintenance worker during a repair (MNT-05). */
    foundByStaff: boolean().notNull().default(false),
    /** For a found-by-staff ticket, the ticket that was being worked on (MNT-05). */
    linkedTicketId: uuid().references((): AnyPgColumn => tickets.id),
    /** For a Duplicate, the original ticket its followers move to (BM-06). */
    duplicateOfId: uuid().references((): AnyPgColumn => tickets.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('tickets_flat_or_place', sql`(${table.flatId} is null) <> (${table.placeId} is null)`),
    check('tickets_description_not_blank', sql`length(trim(${table.description})) > 0`),
    check(
      'tickets_resident_or_staff_reporter',
      sql`${table.foundByStaff} = (${table.occupancyId} is null)`,
    ),
    check(
      'tickets_found_by_staff_is_linked',
      sql`not ${table.foundByStaff} or ${table.linkedTicketId} is not null`,
    ),
    check(
      'tickets_assigned_has_worker_and_due_date',
      sql`${table.status} in ('Reported', 'Cancelled', 'Duplicate', 'Won''t fix') or (${table.assigneeId} is not null and ${table.dueDate} is not null)`,
    ),
    check(
      'tickets_duplicate_has_original',
      sql`(${table.status} = 'Duplicate') = (${table.duplicateOfId} is not null)`,
    ),
    check('tickets_not_duplicate_of_itself', sql`${table.duplicateOfId} <> ${table.id}`),
    index('tickets_status_idx').on(table.status),
    index('tickets_assignee_idx').on(table.assigneeId),
    index('tickets_place_category_idx').on(table.placeId, table.category),
    index('tickets_occupancy_idx').on(table.occupancyId),
  ],
).enableRLS();

/** A ticket as read from the database. */
export type Ticket = typeof tickets.$inferSelect;

/** The fields needed to create a ticket. */
export type NewTicket = typeof tickets.$inferInsert;
