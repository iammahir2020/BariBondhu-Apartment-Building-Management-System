/**
 * Reassigns an open maintenance ticket without changing its status (BM-02, BM-06, MNT-02, NFR-27).
 *
 * @author Jannatul Ferdus Nishi
 */
import { AppError } from '@/lib/errors';
import type { AuditWriter } from '@/services/auditService';
import type { Ticket } from '@/models';
import type { TicketNoticeDeps } from '@/services/ticketNotifications';

/** Work states that allow an assigned ticket to be reassigned. */
export type ReassignableTicketStatus = Extract<
  Ticket['status'],
  'Assigned' | 'In progress' | 'On hold'
>;

const REASSIGNABLE_STATUSES: readonly ReassignableTicketStatus[] = [
  'Assigned',
  'In progress',
  'On hold',
];

function isReassignableStatus(status: Ticket['status']): status is ReassignableTicketStatus {
  return REASSIGNABLE_STATUSES.some((reassignableStatus) => reassignableStatus === status);
}

/** Current ticket details needed to validate a reassignment. */
export interface TicketReassignmentSnapshot {
  /** Ticket identifier. */
  id: string;
  /** Current work state, which reassignment preserves. */
  status: Ticket['status'];
  /** Ticket title used in notifications. */
  title: Ticket['title'];
  /** Current maintenance worker. */
  assigneeId: string | null;
}

/** Database operations required to reassign an open ticket. */
export interface ManagerTicketReassignmentStore {
  /** Finds a ticket only when it belongs to the manager's building. */
  findTicketForReassignment(ticketId: string): Promise<TicketReassignmentSnapshot | undefined>;
  /** Checks whether a profile belongs to an active maintenance worker. */
  isActiveMaintenanceStaff(staffId: string): Promise<boolean>;
  /**
   * Saves the new assignee only if the expected state and previous assignee are still current.
   * @returns False when the ticket or target staff changed concurrently.
   */
  saveReassignmentIfUnchanged(input: {
    ticketId: string;
    status: ReassignableTicketStatus;
    previousAssigneeId: string;
    staffId: string;
    updatedAt: Date;
  }): Promise<boolean>;
}

/** Dependencies used by the manager ticket reassignment service. */
export interface ManagerTicketReassignmentDeps {
  /** Building-scoped ticket reads and writes. */
  tickets: ManagerTicketReassignmentStore;
  /** Writes audit entries for successful reassignments. */
  audit: AuditWriter;
  /** Sends in-app notifications to the old worker, new worker, reporter and followers. */
  notices: TicketNoticeDeps;
}

/** Input for reassigning an open ticket. */
export interface ReassignMaintenanceTicketInput {
  /** Ticket being reassigned. */
  ticketId: string;
  /** Manager making the change. */
  managerId: string;
  /** New maintenance worker. */
  staffId: string;
}

/** Result of a successful reassignment. */
export interface ReassignmentResult {
  /** Ticket identifier. */
  ticketId: string;
  /** The preserved work state. */
  status: ReassignableTicketStatus;
  /** New maintenance worker. */
  assigneeId: string;
}

/**
 * Reassigns an Assigned, In progress or On hold ticket to another active maintenance worker.
 *
 * @param deps - Ticket store, audit writer and notification dependencies.
 * @param input - Ticket, manager and new worker identifiers.
 * @param now - Current time, injectable for tests.
 * @returns The new assignee and unchanged ticket status.
 * @throws AppError 400 when an identifier is blank or the new worker is invalid.
 * @throws AppError 404 when the ticket is missing or outside the manager's building.
 * @throws AppError 409 when the ticket is not in a reassignable state or changed concurrently.
 */
export async function reassignMaintenanceTicket(
  deps: ManagerTicketReassignmentDeps,
  input: ReassignMaintenanceTicketInput,
  now: Date = new Date(),
): Promise<ReassignmentResult> {
  const ticketId = input.ticketId?.trim();
  const managerId = input.managerId?.trim();
  const staffId = input.staffId?.trim();
  if (!ticketId || !managerId || !staffId) {
    throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
  }

  const ticket = await deps.tickets.findTicketForReassignment(ticketId);
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.');

  if (!isReassignableStatus(ticket.status)) {
    throw new AppError(
      'CONFLICT',
      'Only Assigned, In progress or On hold tickets can be reassigned.',
    );
  }
  if (!ticket.assigneeId) {
    throw new AppError('CONFLICT', 'The ticket has no assigned maintenance staff member.');
  }
  if (ticket.assigneeId === staffId) {
    throw new AppError('BAD_REQUEST', 'Choose a different maintenance staff member.');
  }
  if (!(await deps.tickets.isActiveMaintenanceStaff(staffId))) {
    throw new AppError('BAD_REQUEST', 'Choose an active maintenance staff member.');
  }

  const saved = await deps.tickets.saveReassignmentIfUnchanged({
    ticketId,
    status: ticket.status,
    previousAssigneeId: ticket.assigneeId,
    staffId,
    updatedAt: now,
  });
  if (!saved) {
    throw new AppError('CONFLICT', 'The ticket has changed. Refresh and try again.');
  }

  await deps.audit({
    actorId: managerId,
    action: 'ticket.reassign',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: { status: ticket.status, assigneeId: ticket.assigneeId },
    newValues: { status: ticket.status, assigneeId: staffId },
  });

  const title = ticket.title?.trim() || 'Untitled ticket';
  const notifications = await Promise.allSettled([
    deps.notices.notify({
      recipientId: staffId,
      text: `Ticket reassigned to you: ${title}`,
      link: '/maintenance',
    }),
    deps.notices.notify({
      recipientId: ticket.assigneeId,
      text: `Ticket reassigned from you: ${title}`,
      link: '/maintenance',
    }),
    notifyFollowers(deps.notices, ticket.id, title),
  ]);
  for (const result of notifications) {
    if (result.status === 'rejected') {
      console.error('Could not send a ticket reassignment notification', result.reason);
    }
  }

  return { ticketId, status: ticket.status, assigneeId: staffId };
}

async function notifyFollowers(
  notices: TicketNoticeDeps,
  ticketId: string,
  title: string,
): Promise<void> {
  const followerIds = await notices.recipients.followerAccountIds(ticketId);
  const results = await Promise.allSettled(
    [...new Set(followerIds)].map((recipientId) =>
      notices.notify({
        recipientId,
        text: `The maintenance worker for "${title}" has changed.`,
        link: '/resident/tickets',
      }),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Could not send a ticket reassignment notification', result.reason);
    }
  }
}
