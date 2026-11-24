/**
 * What the resident's ticket screens (RES-02) get from `/api/tickets` and `/api/tickets/match`, and how they show
 * it: the badge colour for each status, as in the prototype, and dates in Dhaka time. Dates arrive as ISO strings,
 * because the routes send JSON.
 *
 * @author Mahir Al Kamal
 */
import type { TicketCategory, TicketStatus } from '@/models/Ticket';

/** A ticket as the routes send it. Only the fields the resident's screens show. */
export interface TicketView {
  id: string;
  title: string | null;
  category: TicketCategory;
  status: TicketStatus;
  placeId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of My tickets, as `GET /api/tickets` sends it. */
export interface MyTicketView {
  ticket: TicketView;
  /** The common-area place's name, or null for a fault inside the flat. */
  placeName: string | null;
  /** How many households follow it, the reporter's included. */
  followerCount: number;
  /** True if my household reported it, false if it only follows it ("Me too"). */
  reportedByMe: boolean;
}

/** The badge variants a status can use. */
export type StatusBadgeVariant = 'warn' | 'info' | 'ok' | 'mute';

/** Badge colour per status: waiting on the manager in amber, being worked on in blue, done in green or grey. */
export const STATUS_BADGE: Readonly<Record<TicketStatus, StatusBadgeVariant>> = {
  Reported: 'warn',
  Assigned: 'info',
  'In progress': 'info',
  'On hold': 'warn',
  Fixed: 'ok',
  Closed: 'mute',
  Cancelled: 'mute',
  Duplicate: 'mute',
  "Won't fix": 'mute',
};

/**
 * A day for reading, like "12 Nov", in Dhaka time.
 * @param iso - An ISO date or date-time.
 * @returns The day, or the text as it came if it isn't a date.
 */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Dhaka',
  });
}

/**
 * A moment for reading, like "12 Nov, 9:14 am", in Dhaka time.
 * @param iso - An ISO date-time.
 * @returns The day and time, or the text as it came if it isn't a date.
 */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })
    .toLowerCase();
  return `${formatDay(iso)}, ${time}`;
}
