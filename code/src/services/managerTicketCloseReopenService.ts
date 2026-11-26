/**
 * BB-1304: Manager closes a Fixed ticket or reopens it with a reason (BM-07, NFR-27).
 *
 * @author Jannatul Ferdus Nishi
 */
import { randomUUID } from 'node:crypto';

import { AppError } from '@/lib/errors';
import type { NewTicketStatusChange, Ticket } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import {
  notifyTicketStatusChange,
  statusChangeText,
  type TicketNoticeDeps,
} from '@/services/ticketNotifications';
import { checkTicketTransition } from '@/services/ticketStateMachine';

/** Current ticket details needed to close or reopen a ticket. */
export interface TicketCloseReopenSnapshot {
  /** Ticket identifier. */
  id: string;
  /** Current state. */
  status: Ticket['status'];
  /** Title shown in notifications. */
  title: Ticket['title'];
  /** Maintenance worker who remains assigned when a ticket is reopened. */
  assigneeId: string | null;
}

/** Database operations required to close or reopen a Fixed ticket. */
export interface ManagerTicketCloseReopenStore {
  /** Finds the current state and assignment of a ticket. */
  findTicket(ticketId: string): Promise<TicketCloseReopenSnapshot | undefined>;

  /**
   * Atomically changes a still-Fixed ticket's status and saves its status history.
   *
   * @returns False if the ticket is no longer Fixed.
   */
  saveStatusChangeIfFixed(input: {
    ticketId: string;
    status: 'Closed' | 'Assigned';
    change: NewTicketStatusChange;
  }): Promise<boolean>;
}

/** Dependencies used by the manager ticket close/reopen service. */
export interface ManagerTicketCloseReopenDeps {
  /** Database operations for changing ticket status. */
  tickets: ManagerTicketCloseReopenStore;
  /** Writes audit entries for successful status changes. */
  audit: AuditWriter;
  /** Sends ticket status notifications. */
  notices: TicketNoticeDeps;
}

/** Input for closing a Fixed ticket. */
export interface CloseFixedTicketInput {
  /** Ticket being closed. */
  ticketId: string;
  /** Manager making the change. */
  managerId: string;
}

/** Input for reopening a Fixed ticket. */
export interface ReopenFixedTicketInput {
  /** Ticket being reopened. */
  ticketId: string;
  /** Manager making the change. */
  managerId: string;
  /** Required reason for reopening the ticket. */
  reason: string;
}

/**
 * Closes a Fixed ticket and notifies its reporter and followers.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Ticket and manager identifiers.
 * @param now - Current time, injectable for tests.
 * @returns The closed ticket's identifier and status.
 * @throws AppError 400 if an identifier is blank.
 * @throws AppError 404 if the ticket does not exist.
 * @throws AppError 409 if the ticket is not Fixed or a concurrent change occurs.
 */
export async function closeFixedTicket(
  deps: ManagerTicketCloseReopenDeps,
  input: CloseFixedTicketInput,
  now: Date = new Date(),
): Promise<{ ticketId: string; status: 'Closed' }> {
  const { ticketId, managerId } = validateIdentifiers(input.ticketId, input.managerId);
  const ticket = await findTicket(deps, ticketId);

  checkTicketTransition(ticket.status, 'Closed', 'manager');

  const change = makeStatusChange(ticketId, managerId, ticket.status, 'Closed', null, now);
  const saved = await deps.tickets.saveStatusChangeIfFixed({
    ticketId,
    status: 'Closed',
    change,
  });
  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  await deps.audit({
    actorId: managerId,
    action: 'ticket.close',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: { status: ticket.status },
    newValues: { status: 'Closed' },
  });

  await notifyTicketStatusChange(deps.notices, notificationTicket(ticket), {
    from: ticket.status,
    to: 'Closed',
    changedById: managerId,
  });

  return { ticketId, status: 'Closed' };
}

/**
 * Reopens a Fixed ticket as Assigned, keeping its current maintenance worker and notifying them.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Ticket, manager and required reason.
 * @param now - Current time, injectable for tests.
 * @returns The reopened ticket's identifier, status and reason.
 * @throws AppError 400 if an identifier is blank or the required reason is empty.
 * @throws AppError 404 if the ticket does not exist.
 * @throws AppError 409 if the ticket is not Fixed, has no assigned worker, or a concurrent change occurs.
 */
export async function reopenFixedTicket(
  deps: ManagerTicketCloseReopenDeps,
  input: ReopenFixedTicketInput,
  now: Date = new Date(),
): Promise<{ ticketId: string; status: 'Assigned'; reason: string }> {
  const { ticketId, managerId } = validateIdentifiers(input.ticketId, input.managerId);
  const reason = input.reason?.trim();
  const ticket = await findTicket(deps, ticketId);

  if (ticket.status === 'Closed') {
    checkTicketTransition(ticket.status, 'Assigned', 'manager', reason);
  }
  if (ticket.status !== 'Fixed') {
    throw new AppError('CONFLICT', 'Only a Fixed ticket can be reopened.', {
      from: ticket.status,
      to: 'Assigned',
    });
  }
  checkTicketTransition(ticket.status, 'Assigned', 'manager', reason);
  if (!ticket.assigneeId) {
    throw new AppError('CONFLICT', 'The Fixed ticket has no assigned maintenance staff member.');
  }

  const change = makeStatusChange(ticketId, managerId, ticket.status, 'Assigned', reason, now);
  const saved = await deps.tickets.saveStatusChangeIfFixed({
    ticketId,
    status: 'Assigned',
    change,
  });
  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  await deps.audit({
    actorId: managerId,
    action: 'ticket.reopen',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: { status: ticket.status },
    newValues: { status: 'Assigned', reason },
  });

  const notificationTicketData = notificationTicket(ticket);
  const notifications = await Promise.allSettled([
    notifyTicketStatusChange(deps.notices, notificationTicketData, {
      from: ticket.status,
      to: 'Assigned',
      reason,
      changedById: managerId,
    }),
    deps.notices.notify({
      recipientId: ticket.assigneeId,
      text: statusChangeText(notificationTicketData, {
        from: ticket.status,
        to: 'Assigned',
        reason,
      }),
      link: '/maintenance',
    }),
  ]);
  for (const result of notifications) {
    if (result.status === 'rejected') {
      console.error('Could not send a ticket reopen notification', result.reason);
    }
  }

  return { ticketId, status: 'Assigned', reason };
}

/** Validates the ticket and manager identifiers before accessing the store. */
function validateIdentifiers(
  ticketIdInput: string,
  managerIdInput: string,
): {
  ticketId: string;
  managerId: string;
} {
  const ticketId = ticketIdInput?.trim();
  const managerId = managerIdInput?.trim();
  if (!ticketId || !managerId) {
    throw new AppError('BAD_REQUEST', 'Invalid ticket update request.');
  }
  return { ticketId, managerId };
}

/** Loads a ticket or reports the shared not-found error. */
async function findTicket(
  deps: ManagerTicketCloseReopenDeps,
  ticketId: string,
): Promise<TicketCloseReopenSnapshot> {
  const ticket = await deps.tickets.findTicket(ticketId);
  if (!ticket) {
    throw new AppError('NOT_FOUND', 'Ticket not found.');
  }
  return ticket;
}

/** Builds the immutable status history entry for a validated transition. */
function makeStatusChange(
  ticketId: string,
  managerId: string,
  fromStatus: Ticket['status'],
  toStatus: 'Closed' | 'Assigned',
  reason: string | null,
  now: Date,
): NewTicketStatusChange {
  return {
    id: randomUUID(),
    ticketId,
    fromStatus,
    toStatus,
    changedById: managerId,
    reason,
    createdAt: now,
  };
}

/** Provides a non-empty title for notification text. */
function notificationTicket(ticket: TicketCloseReopenSnapshot): Pick<Ticket, 'id' | 'title'> {
  return {
    id: ticket.id,
    title: ticket.title?.trim() || 'Untitled ticket',
  };
}
