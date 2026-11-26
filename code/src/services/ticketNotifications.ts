/**
 * In-app notifications about fault tickets (RES-02, NFR-29): the manager hears about every new or cancelled ticket,
 * and the households that follow a ticket hear about every status change. The reporter's household follows its
 * ticket from the start, so "the reporter and followers" are the ticket's followers. A household that stopped
 * following isn't told any more.
 *
 * The ticket services of features 12, 13, 14 and 15 call these after a change is saved. A notification that can't
 * be sent is logged and never undoes or fails the change itself, so a resident or manager is never asked to repeat
 * something that already worked.
 *
 * @author Mahir Al Kamal
 */
import type { Ticket, TicketStatus } from '@/models/Ticket';
import type { NotificationInput, Notifier } from '@/services/notifier';

/** Where a notification about a ticket takes the manager: the Tickets page (M-Tickets). */
export const MANAGER_TICKETS_LINK = '/manager/tickets';

/** Where a notification about a ticket takes a resident: My tickets (R-Tickets). */
export const RESIDENT_TICKETS_LINK = '/resident/tickets';

/** Who to tell about a ticket. */
export interface TicketRecipients {
  /** The profile ids of every active building manager account. */
  activeManagerIds(): Promise<string[]>;
  /** The profile ids of the active resident accounts of the households that follow a ticket. */
  followerAccountIds(ticketId: string): Promise<string[]>;
}

/** What the ticket notifications work with. */
export interface TicketNoticeDeps {
  recipients: TicketRecipients;
  notify: Notifier;
}

/** A status change that has just been saved. */
export interface SavedStatusChange {
  from: TicketStatus;
  to: TicketStatus;
  /** The reason given with it, if any (On hold, reopen, Duplicate, Won't fix). */
  reason?: string | null;
  /** The account that made the change. It isn't told about its own change. */
  changedById: string;
}

/** How a notification says what happened to a ticket, by its new status. */
const STATUS_PHRASES: Record<TicketStatus, string> = {
  Reported: 'was reported',
  Assigned: 'has been assigned to a staff member',
  'In progress': 'is being worked on',
  'On hold': 'is on hold',
  Fixed: 'has been fixed',
  Closed: 'is closed',
  Cancelled: 'was cancelled',
  Duplicate: 'was marked as a duplicate of another ticket',
  "Won't fix": "won't be fixed",
};

/**
 * The text a follower gets when a ticket's status changes, with the reason when one was given.
 * @param ticket - The ticket, for its title.
 * @param change - The change that was saved.
 * @returns The notification text, for example `"Water leak in the lobby" has been fixed.`
 */
export function statusChangeText(
  ticket: Pick<Ticket, 'title'>,
  change: Pick<SavedStatusChange, 'from' | 'to' | 'reason'>,
): string {
  const phrase =
    change.from === 'Fixed' && change.to === 'Assigned'
      ? 'was reopened'
      : STATUS_PHRASES[change.to];
  const reason = change.reason?.trim();
  return `"${ticket.title}" ${phrase}.${reason ? ` Reason: ${reason}` : ''}`;
}

/**
 * Tells the manager about a new ticket (RES-02 c1 and c4, MNT-05). An Urgent ticket says so first.
 * @param deps - Recipients and notifier.
 * @param ticket - The ticket that was just saved.
 */
export async function notifyNewTicket(deps: TicketNoticeDeps, ticket: Ticket): Promise<void> {
  const kind = ticket.priority === 'Urgent' ? 'Urgent fault reported' : 'New fault reported';
  await sendToAll(deps.notify, await deps.recipients.activeManagerIds(), {
    text: `${kind}: ${ticket.title}`,
    link: MANAGER_TICKETS_LINK,
  });
}

/**
 * Tells the manager that a resident cancelled their Reported ticket (RES-02 c6).
 * @param deps - Recipients and notifier.
 * @param ticket - The ticket that was just cancelled.
 */
export async function notifyTicketCancelled(deps: TicketNoticeDeps, ticket: Ticket): Promise<void> {
  await sendToAll(deps.notify, await deps.recipients.activeManagerIds(), {
    text: `Cancelled by the resident: ${ticket.title}`,
    link: MANAGER_TICKETS_LINK,
  });
}

/**
 * Tells every household that follows a ticket about a status change (RES-02 c5, BM-06, BM-07, MNT-03), with the
 * reason when one was given. Call it after the change is saved. The account that made the change isn't told.
 * @param deps - Recipients and notifier.
 * @param ticket - The ticket, for its id and title.
 * @param change - The change that was saved.
 */
export async function notifyTicketStatusChange(
  deps: TicketNoticeDeps,
  ticket: Pick<Ticket, 'id' | 'title'>,
  change: SavedStatusChange,
): Promise<void> {
  const followers = await deps.recipients.followerAccountIds(ticket.id);
  await sendToAll(
    deps.notify,
    followers.filter((id) => id !== change.changedById),
    { text: statusChangeText(ticket, change), link: RESIDENT_TICKETS_LINK },
  );
}

/** Sends one notification to each recipient once. A failed send is logged, not thrown. */
async function sendToAll(
  notify: Notifier,
  recipientIds: readonly string[],
  message: Omit<NotificationInput, 'recipientId'>,
): Promise<void> {
  const results = await Promise.allSettled(
    [...new Set(recipientIds)].map((recipientId) => notify({ recipientId, ...message })),
  );
  for (const result of results) {
    if (result.status === 'rejected') console.error('Could not send a notification', result.reason);
  }
}
