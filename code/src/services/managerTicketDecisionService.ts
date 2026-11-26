/**
 * BB-1303: Manager marks a reported ticket Duplicate or Won't fix (BM-06, BR-13, NFR-27).
 *
 * @author Jannatul Ferdus Nishi
 */
import { randomUUID } from 'node:crypto';

import { AppError } from '@/lib/errors';
import type { NewTicketStatusChange, Ticket } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import { notifyTicketStatusChange, type TicketNoticeDeps } from '@/services/ticketNotifications';
import { checkTicketTransition, isFinalTicketStatus } from '@/services/ticketStateMachine';

/** Current ticket details needed to validate a manager decision. */
export interface TicketDecisionSnapshot {
  /** Ticket identifier. */
  id: string;
  /** Current state. */
  status: Ticket['status'];
  /** Title shown in the resident notification. */
  title: Ticket['title'];
}

/** Database operations required to record a manager's ticket decision. */
export interface ManagerTicketDecisionStore {
  /** Finds the current state and title of a ticket. */
  findTicket(ticketId: string): Promise<TicketDecisionSnapshot | undefined>;

  /**
   * Atomically saves a Reported ticket's decision and status history. For Duplicate, moves all its followers to
   * the original ticket, avoiding duplicate follower rows, and sets the original-ticket link.
   *
   * @returns False if the ticket is no longer Reported or the original is no longer open.
   */
  saveReportedDecisionIfUnchanged(input: {
    ticketId: string;
    status: 'Duplicate' | "Won't fix";
    duplicateOfId: string | null;
    change: NewTicketStatusChange;
  }): Promise<boolean>;
}

/** Dependencies used by the manager ticket decision service. */
export interface ManagerTicketDecisionDeps {
  /** Database operations for recording decisions. */
  tickets: ManagerTicketDecisionStore;
  /** Writes audit entries for successful decisions. */
  audit: AuditWriter;
  /** Sends ticket status notifications. */
  notices: TicketNoticeDeps;
}

/** Input for marking a Reported ticket as Duplicate. */
export interface MarkTicketDuplicateInput {
  /** Ticket being marked as a duplicate. */
  ticketId: string;
  /** Manager making the decision. */
  managerId: string;
  /** Existing, open ticket to which followers will be transferred. */
  originalTicketId: string;
  /** Required reason for the decision. */
  reason: string;
}

/** Input for marking a Reported ticket as Won't fix. */
export interface MarkTicketWontFixInput {
  /** Ticket being declined. */
  ticketId: string;
  /** Manager making the decision. */
  managerId: string;
  /** Required reason for the decision. */
  reason: string;
}

/** Result of a completed manager decision. */
export interface TicketDecisionResult {
  /** Ticket that was updated. */
  ticketId: string;
  /** Saved final status. */
  status: 'Duplicate' | "Won't fix";
  /** Original ticket for Duplicate, otherwise null. */
  duplicateOfId: string | null;
  /** Saved reason. */
  reason: string;
}

/**
 * Marks a Reported ticket as a duplicate of another open ticket and transfers its followers.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Ticket, original ticket, manager and reason.
 * @param now - Current time, injectable for tests.
 * @returns The completed decision.
 * @throws AppError 400 if an identifier or original ticket is missing or the original is the same ticket.
 * @throws AppError 404 if the ticket or original ticket does not exist.
 * @throws AppError 409 if the state transition is not allowed, the original is final, or a concurrent change occurs.
 */
export async function markTicketDuplicate(
  deps: ManagerTicketDecisionDeps,
  input: MarkTicketDuplicateInput,
  now: Date = new Date(),
): Promise<TicketDecisionResult> {
  const ticketId = input.ticketId.trim();
  const managerId = input.managerId.trim();
  const originalTicketId = input.originalTicketId.trim();
  if (!ticketId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Invalid ticket decision request.');
  }
  if (!originalTicketId) {
    throw new AppError('BAD_REQUEST', 'Choose the original ticket.');
  }
  if (ticketId === originalTicketId) {
    throw new AppError('BAD_REQUEST', 'Choose a different original ticket.');
  }

  return decideTicket(deps, {
    ticketId,
    managerId,
    status: 'Duplicate',
    duplicateOfId: originalTicketId,
    reason: input.reason,
    now,
  });
}

/**
 * Marks a Reported ticket as Won't fix.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Ticket, manager and reason.
 * @param now - Current time, injectable for tests.
 * @returns The completed decision.
 * @throws AppError 400 if an identifier is missing or the required reason is blank.
 * @throws AppError 404 if the ticket does not exist.
 * @throws AppError 409 if the state transition is not allowed or a concurrent change occurs.
 */
export async function markTicketWontFix(
  deps: ManagerTicketDecisionDeps,
  input: MarkTicketWontFixInput,
  now: Date = new Date(),
): Promise<TicketDecisionResult> {
  const ticketId = input.ticketId.trim();
  const managerId = input.managerId.trim();
  if (!ticketId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Invalid ticket decision request.');
  }

  return decideTicket(deps, {
    ticketId,
    managerId,
    status: "Won't fix",
    duplicateOfId: null,
    reason: input.reason,
    now,
  });
}

/** Saves a validated decision, then records its audit entry and notifies the original followers. */
async function decideTicket(
  deps: ManagerTicketDecisionDeps,
  input: {
    ticketId: string;
    managerId: string;
    status: 'Duplicate' | "Won't fix";
    duplicateOfId: string | null;
    reason: string;
    now: Date;
  },
): Promise<TicketDecisionResult> {
  const ticket = await deps.tickets.findTicket(input.ticketId);
  if (!ticket) {
    throw new AppError('NOT_FOUND', 'Ticket not found.');
  }

  const reason = input.reason.trim();
  checkTicketTransition(ticket.status, input.status, 'manager', reason);

  if (input.duplicateOfId) {
    const original = await deps.tickets.findTicket(input.duplicateOfId);
    if (!original) {
      throw new AppError('NOT_FOUND', 'Original ticket not found.');
    }
    if (isFinalTicketStatus(original.status)) {
      throw new AppError('CONFLICT', 'Choose an open original ticket.');
    }
  }

  const followerIds = await deps.notices.recipients.followerAccountIds(input.ticketId);
  const change: NewTicketStatusChange = {
    id: randomUUID(),
    ticketId: input.ticketId,
    fromStatus: ticket.status,
    toStatus: input.status,
    changedById: input.managerId,
    reason,
    createdAt: input.now,
  };
  const saved = await deps.tickets.saveReportedDecisionIfUnchanged({
    ticketId: input.ticketId,
    status: input.status,
    duplicateOfId: input.duplicateOfId,
    change,
  });
  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  await deps.audit({
    actorId: input.managerId,
    action: input.status === 'Duplicate' ? 'ticket.duplicate' : 'ticket.wont_fix',
    entityType: 'tickets',
    entityId: input.ticketId,
    oldValues: { status: ticket.status, duplicateOfId: null },
    newValues: {
      status: input.status,
      duplicateOfId: input.duplicateOfId,
      reason,
    },
  });

  await notifyTicketStatusChange(
    deps.notices,
    { id: ticket.id, title: ticket.title?.trim() || 'Untitled ticket' },
    {
      from: ticket.status,
      to: input.status,
      reason,
      changedById: input.managerId,
    },
    followerIds,
  );

  return {
    ticketId: input.ticketId,
    status: input.status,
    duplicateOfId: input.duplicateOfId,
    reason,
  };
}
