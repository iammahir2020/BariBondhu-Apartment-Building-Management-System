/**
 * Read-only ticket queries for the building manager's ticket list and details (BM-06, BM-07).
 *
 * @author Jannatul Ferdus Nishi
 */
import { AppError } from '@/lib/errors';
import type { TicketCategory, TicketStatus } from '@/models';
import { isLateUnassigned, isOverdue, type HomeTicket } from '@/services/managerHomeService';

/** A ticket row safe for the manager's ticket list and detail view. */
export interface ManagerTicketSnapshot extends HomeTicket {
  /** Ticket identifier. */
  id: string;
  /** Short title; some tickets reported by staff do not have one. */
  title: string | null;
  /** Fault category. */
  category: TicketCategory;
  /** Common-area place or block/flat label. */
  place: string;
  /** Reported problem description. */
  description: string;
  /** Private-storage path for the ticket photo, if present. */
  photoPath: string | null;
  /** When someone is home for a repair. */
  homeTimes: string | null;
  /** Manager's instructions to maintenance staff. */
  instructions: string | null;
  /** Whether maintenance staff found the problem during another repair. */
  foundByStaff: boolean;
  /** Number of households following the ticket other than its reporter. */
  meTooCount: number;
  /** Last update time. */
  updatedAt: Date;
}

/** One saved state change, oldest first. */
export interface ManagerTicketHistoryEntry {
  /** Previous ticket state, or null for its initial Reported row. */
  fromStatus: TicketStatus | null;
  /** New ticket state. */
  toStatus: TicketStatus;
  /** Reason recorded for the state change, if any. */
  reason: string | null;
  /** When the state change was saved. */
  changedAt: Date;
  /** Display name of the account that made the change. */
  changedByName: string;
}

/** A work note and its author's display name. */
export interface ManagerTicketWorkNote {
  /** Work-note identifier. */
  id: string;
  /** Note written by maintenance staff. */
  text: string;
  /** When the note was saved. */
  createdAt: Date;
  /** Display name of the author. */
  authorName: string;
}

/** Details loaded with a ticket's status history and work notes. */
export interface ManagerTicketDetailsSnapshot {
  /** Ticket visible to the manager. */
  ticket: ManagerTicketSnapshot;
  /** Status history, oldest first. */
  statusChanges: ManagerTicketHistoryEntry[];
  /** Work notes, oldest first. */
  workNotes: ManagerTicketWorkNote[];
}

/** Database reads needed by the manager ticket list and detail queries. */
export interface ManagerTicketQueryStore {
  /** Lists tickets in the manager's building, newest first. */
  listTickets(): Promise<ManagerTicketSnapshot[]>;
  /** Finds details only when the ticket belongs to the manager's building. */
  findTicketDetails(ticketId: string): Promise<ManagerTicketDetailsSnapshot | undefined>;
  /** Lists active maintenance staff for the manager's assignment form. */
  listActiveMaintenanceStaff(): Promise<ManagerMaintenanceStaff[]>;
}

/** An active maintenance profile that may receive an assignment. */
export interface ManagerMaintenanceStaff {
  /** Maintenance profile identifier. */
  id: string;
  /** Name shown in the assignment form. */
  displayName: string;
}

/** A ticket plus the flags shown in the manager's list. */
export interface ManagerTicketListItem extends ManagerTicketSnapshot {
  /** True when the ticket is beyond the Reported-without-assignee threshold. */
  late: boolean;
  /** True when an assigned work-state ticket's due date has passed. */
  overdue: boolean;
}

/** A ticket's details and its list flags. */
export interface ManagerTicketDetails {
  /** Ticket fields and the flags shown in the manager's list. */
  ticket: ManagerTicketListItem;
  /** Status history, oldest first. */
  statusChanges: ManagerTicketHistoryEntry[];
  /** Work notes, oldest first. */
  workNotes: ManagerTicketWorkNote[];
}

/**
 * Lists every ticket visible to the manager and computes late/overdue flags with the shared BM-06 rules.
 *
 * @param store - Building-scoped database reads.
 * @param now - Current time, injectable for deterministic tests.
 * @returns Tickets in newest-first order.
 */
export async function listManagerTickets(
  store: ManagerTicketQueryStore,
  now: Date = new Date(),
): Promise<ManagerTicketListItem[]> {
  const tickets = await store.listTickets();
  return tickets.map((ticket) => ({
    ...ticket,
    late: isLateUnassigned(ticket, now),
    overdue: isOverdue(ticket, now),
  }));
}

/**
 * Loads one ticket and its history, hiding tickets outside the manager's building as not found.
 *
 * @param store - Building-scoped database reads.
 * @param ticketId - Ticket identifier.
 * @param now - Current time, injectable for deterministic tests.
 * @returns Ticket details with late/overdue flags.
 * @throws AppError 400 when the identifier is blank.
 * @throws AppError 404 when no in-scope ticket has that identifier.
 */
export async function getManagerTicketDetails(
  store: ManagerTicketQueryStore,
  ticketId: string,
  now: Date = new Date(),
): Promise<ManagerTicketDetails> {
  const id = ticketId.trim();
  if (!id) throw new AppError('BAD_REQUEST', 'Invalid ticket ID.');

  const details = await store.findTicketDetails(id);
  if (!details) throw new AppError('NOT_FOUND', 'Ticket not found.');

  return {
    ...details,
    ticket: {
      ...details.ticket,
      late: isLateUnassigned(details.ticket, now),
      overdue: isOverdue(details.ticket, now),
    },
  };
}

/**
 * Lists active maintenance staff for the assignment form.
 *
 * @param store - Database reads.
 * @returns Active staff in display-name order.
 */
export async function listManagerMaintenanceStaff(
  store: ManagerTicketQueryStore,
): Promise<ManagerMaintenanceStaff[]> {
  return store.listActiveMaintenanceStaff();
}
