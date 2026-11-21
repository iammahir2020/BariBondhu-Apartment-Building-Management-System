/**
 * The ticket state machine: which status changes are allowed, who may make each one, and which need a reason.
 * It follows the ticket state diagram in `docs/sds/design-inputs-from-srs.md` word for word (RES-02, BM-06, BM-07,
 * MNT-03). The ticket services of features 12, 13 and 14 call {@link checkTicketTransition} before saving a
 * change; only the owner of feature 12 changes this file.
 *
 * Rules that need more than the two statuses stay in the calling service: a resident cancels only while nobody
 * else follows the ticket (RES-02), and Assigned needs a staff member and a due date (BM-06).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import type { TicketStatus } from '@/models/Ticket';

/** One allowed status change. */
export interface TicketTransition {
  /** Status before the change. */
  readonly from: TicketStatus;
  /** Status after the change. */
  readonly to: TicketStatus;
  /** The only role that may make this change. */
  readonly role: Role;
  /** Whether the change must be saved with a reason. */
  readonly needsReason: boolean;
}

/** Every status change the ticket state diagram allows. Anything not listed is refused. */
export const TICKET_TRANSITIONS: readonly TicketTransition[] = [
  // BM-06: the manager assigns a Reported ticket.
  { from: 'Reported', to: 'Assigned', role: 'manager', needsReason: false },
  // MNT-03: the staff member starts, pauses, resumes and finishes the work.
  { from: 'Assigned', to: 'In progress', role: 'maintenance', needsReason: false },
  { from: 'In progress', to: 'On hold', role: 'maintenance', needsReason: true },
  { from: 'On hold', to: 'In progress', role: 'maintenance', needsReason: false },
  { from: 'In progress', to: 'Fixed', role: 'maintenance', needsReason: false },
  // BM-07: the manager closes a Fixed ticket, or reopens it with a reason.
  { from: 'Fixed', to: 'Closed', role: 'manager', needsReason: false },
  { from: 'Fixed', to: 'Assigned', role: 'manager', needsReason: true },
  // RES-02: the reporter cancels a ticket nobody has picked up yet.
  { from: 'Reported', to: 'Cancelled', role: 'resident', needsReason: false },
  // BM-06: the manager declines a Reported ticket, with a reason.
  { from: 'Reported', to: 'Duplicate', role: 'manager', needsReason: true },
  { from: 'Reported', to: "Won't fix", role: 'manager', needsReason: true },
];

/** Statuses a ticket never leaves. */
export const FINAL_TICKET_STATUSES: readonly TicketStatus[] = [
  'Closed',
  'Cancelled',
  'Duplicate',
  "Won't fix",
];

/**
 * Whether a ticket in this status is finished and can't change again.
 * @param status - The ticket's current status.
 * @returns `true` for Closed, Cancelled, Duplicate and Won't fix.
 */
export function isFinalTicketStatus(status: TicketStatus): boolean {
  return FINAL_TICKET_STATUSES.includes(status);
}

/**
 * The changes a user in this role may make to a ticket in this status, for showing only the buttons that work.
 * @param from - The ticket's current status.
 * @param role - The signed-in user's role.
 * @returns The allowed transitions, in the order of {@link TICKET_TRANSITIONS}; empty if there are none.
 */
export function allowedTicketTransitions(from: TicketStatus, role: Role): TicketTransition[] {
  return TICKET_TRANSITIONS.filter((t) => t.from === from && t.role === role);
}

/**
 * Checks one status change before it is saved.
 * @param from - The ticket's current status.
 * @param to - The status the user wants.
 * @param role - The role of the user making the change.
 * @param reason - The reason given, if any. Blank text counts as none.
 * @returns The matching transition.
 * @throws AppError `CONFLICT` (409) if the state diagram has no such change.
 * @throws AppError `FORBIDDEN` (403) if another role makes this change.
 * @throws AppError `BAD_REQUEST` (400) if the change needs a reason and none was given.
 */
export function checkTicketTransition(
  from: TicketStatus,
  to: TicketStatus,
  role: Role,
  reason?: string | null,
): TicketTransition {
  const transition = TICKET_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!transition) {
    if (from === 'Closed') {
      throw new AppError(
        'CONFLICT',
        'A Closed ticket cannot be reopened. Report the fault as a new ticket.',
        { from, to },
      );
    }
    throw new AppError('CONFLICT', `A ticket cannot go from ${from} to ${to}.`, { from, to });
  }
  if (transition.role !== role) {
    throw new AppError(
      'FORBIDDEN',
      `Only the ${ROLE_LABELS[transition.role].toLowerCase()} can change a ticket from ${from} to ${to}.`,
      { from, to },
    );
  }
  if (transition.needsReason && !reason?.trim()) {
    throw new AppError('BAD_REQUEST', 'Give a reason.', { from, to });
  }
  return transition;
}
