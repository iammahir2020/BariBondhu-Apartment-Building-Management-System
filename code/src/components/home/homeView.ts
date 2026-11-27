/**
 * What Resident home (prototype `R-Home.html`) picks out of the guest pass and ticket lists, and the line it shows
 * under each: the pass that matters now and the ticket still being worked on, falling back to the newest of each.
 *
 * @author Mahir Al Kamal
 */
import { formatPassWindow } from '@/components/guestPasses/passView';
import { formatDay, type MyTicketView } from '@/components/tickets/ticketView';
import type { GuestPassView } from '@/lib/guestPassResponse';
import type { GuestPassStatus } from '@/services/guestPassStatus';
import { isFinalTicketStatus } from '@/services/ticketStateMachine';

/** Pass statuses whose code still lets guests in. */
const LIVE_PASS: readonly GuestPassStatus[] = ['Scheduled', 'Active', 'Partly used'];

/**
 * The pass to show on home.
 * @param passes - My household's passes, latest start first, as `/api/guest-passes` sends them.
 * @returns The first pass still live, else the latest pass, or null when there are none.
 */
export function homePass(passes: readonly GuestPassView[]): GuestPassView | null {
  return passes.find((pass) => LIVE_PASS.includes(pass.status)) ?? passes[0] ?? null;
}

/**
 * A pass's name with its party size, as the prototype writes it.
 * @param pass - The pass.
 * @returns Like `Rafiq Hasan + 3`, or just the name for one guest.
 */
export function passTitle(pass: GuestPassView): string {
  return pass.guestCount > 1 ? `${pass.guestName} + ${pass.guestCount - 1}` : pass.guestName;
}

/**
 * The line under the pass: how many have arrived once anyone has, otherwise the visit window.
 * @param pass - The pass.
 * @returns Like `2 of 4 arrived`, or `25 Nov, 5:00 pm to 11:00 pm`.
 */
export function passLine(pass: GuestPassView): string {
  if (pass.guestsUsed > 0) return `${pass.guestsUsed} of ${pass.guestCount} arrived`;
  return formatPassWindow(pass.startsAt, pass.endsAt);
}

/**
 * The ticket to show on home.
 * @param rows - My tickets, newest first, as `/api/tickets` sends them.
 * @returns The newest ticket still open, else the newest ticket, or null when there are none.
 */
export function homeTicket(rows: readonly MyTicketView[]): MyTicketView | null {
  return rows.find((row) => !isFinalTicketStatus(row.ticket.status)) ?? rows[0] ?? null;
}

/**
 * The line under the ticket: where it is, or when it finished.
 * @param row - The ticket.
 * @returns Like `Inside my flat · Plumbing`, `Due 28 Nov` once assigned with a due date, or `Closed 20 Nov`.
 */
export function ticketLine(row: MyTicketView): string {
  const { ticket } = row;
  if (isFinalTicketStatus(ticket.status)) return `${ticket.status} ${formatDay(ticket.updatedAt)}`;
  if (ticket.dueDate) return `Due ${formatDay(ticket.dueDate)}`;
  return `${row.placeName ?? 'Inside my flat'} · ${ticket.category}`;
}
