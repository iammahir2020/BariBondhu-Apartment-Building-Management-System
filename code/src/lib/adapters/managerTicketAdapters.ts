/**
 * Building-scoped database adapters for manager ticket queries and state changes (BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import {
  blocks,
  buildings,
  commonAreaPlaces,
  flats,
  profiles,
  ticketFollowers,
  ticketStatusChanges,
  tickets,
  workNotes,
} from '@/models';
import { databaseTicketRecipients, TICKET_PHOTO_BUCKET } from '@/lib/adapters/ticketAdapters';
import { databaseNotifier } from '@/lib/adapters/notificationAdapters';
import { databaseAuditWriter, type AuditWriter } from '@/services/auditService';
import type {
  AssignmentTicketSnapshot,
  ManagerTicketAssignmentStore,
} from '@/services/managerTicketAssignmentService';
import type {
  ManagerTicketCloseReopenStore,
  TicketCloseReopenSnapshot,
} from '@/services/managerTicketCloseReopenService';
import type {
  ManagerTicketDecisionStore,
  TicketDecisionSnapshot,
} from '@/services/managerTicketDecisionService';
import type {
  ManagerTicketDetailsSnapshot,
  ManagerTicketHistoryEntry,
  ManagerTicketQueryStore,
  ManagerTicketSnapshot,
  ManagerTicketWorkNote,
} from '@/services/managerTicketQueryService';
import type { ManagerTicketReassignmentStore } from '@/services/managerTicketReassignmentService';
import type { TicketNoticeDeps } from '@/services/ticketNotifications';
import { isFinalTicketStatus } from '@/services/ticketStateMachine';

/** The database operations used by manager ticket services and read queries. */
export interface ManagerTicketDatabaseStore
  extends
    ManagerTicketAssignmentStore,
    ManagerTicketDecisionStore,
    ManagerTicketCloseReopenStore,
    ManagerTicketReassignmentStore,
    ManagerTicketQueryStore {
  /** One method returns the additional assignee field required by BM-07 as well. */
  findTicket(
    ticketId: string,
  ): Promise<(TicketDecisionSnapshot & TicketCloseReopenSnapshot) | undefined>;
}

/** The dependencies required by all manager ticket API routes. */
export interface ManagerTicketContext {
  /** Building-scoped database operations for manager ticket services and queries. */
  tickets: ManagerTicketDatabaseStore;
  /** Persists audit entries for successful state changes. */
  audit: AuditWriter;
  /** Resolves notification recipients and persists in-app notifications. */
  notices: TicketNoticeDeps;
}

/** A time-limited, manager-authorized URL for a ticket's private photo. */
export interface ManagerTicketPhotoStore {
  /** Returns a signed photo URL when the ticket belongs to the installation's building and has a photo. */
  signedUrlForTicket(ticketId: string): Promise<string | undefined>;
}

/**
 * Resolves the installation's only building. The schema is multi-building capable, but this release's SRS scopes
 * the installation to one building and profiles do not carry a building ID.
 *
 * @param db - Database connection.
 * @returns The single building identifier.
 * @throws AppError 409 when the installation has zero or multiple buildings.
 */
export async function databaseManagerBuildingId(db: Database): Promise<string> {
  const rows = await db.select({ id: buildings.id }).from(buildings).limit(2);
  if (rows.length !== 1) {
    throw new AppError('CONFLICT', 'Ticket access requires exactly one configured building.');
  }
  return rows[0]!.id;
}

/**
 * Wires manager ticket database reads, atomic writes, audit and in-app notification delivery.
 *
 * @param db - Database connection.
 * @returns Building-scoped dependencies for manager ticket services.
 */
export async function databaseManagerTicketContext(db: Database): Promise<ManagerTicketContext> {
  const buildingId = await databaseManagerBuildingId(db);
  return {
    tickets: databaseManagerTicketStore(db, buildingId),
    audit: databaseAuditWriter(db),
    notices: {
      recipients: databaseTicketRecipients(db),
      notify: databaseNotifier(db),
    },
  };
}

/**
 * Creates manager-authorized signed URLs for private ticket photos.
 *
 * @param db - Database connection.
 * @param admin - Supabase service-role client for the private storage bucket.
 * @returns A photo store that first checks building scope before signing.
 */
export function managerTicketPhotoStore(
  db: Database,
  admin: SupabaseClient,
): ManagerTicketPhotoStore {
  return {
    async signedUrlForTicket(ticketId) {
      const buildingId = await databaseManagerBuildingId(db);
      const [ticket] = await db
        .select({ photoPath: tickets.photoPath })
        .from(tickets)
        .where(and(eq(tickets.id, ticketId), ticketBuildingScope(buildingId)))
        .limit(1);
      if (!ticket?.photoPath) return undefined;

      const { data, error } = await admin.storage
        .from(TICKET_PHOTO_BUCKET)
        .createSignedUrl(ticket.photoPath, 300);
      if (error) {
        console.error('Could not create a signed ticket photo URL', error);
        throw new AppError('INTERNAL', 'Could not load the ticket photo.');
      }
      return data.signedUrl;
    },
  };
}

/**
 * Creates ticket persistence operations scoped to a single configured building.
 *
 * @param db - Database connection.
 * @param buildingId - The installation's only building.
 * @returns A store suitable for the manager ticket services.
 */
export function databaseManagerTicketStore(
  db: Database,
  buildingId: string,
): ManagerTicketDatabaseStore {
  const ticketInBuilding = ticketBuildingScope(buildingId);

  async function findTicket(
    ticketId: string,
  ): Promise<(TicketDecisionSnapshot & TicketCloseReopenSnapshot) | undefined> {
    const [row] = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        title: tickets.title,
        assigneeId: tickets.assigneeId,
      })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), ticketInBuilding))
      .limit(1);
    return row;
  }

  return {
    async findTicketForAssignment(ticketId): Promise<AssignmentTicketSnapshot | undefined> {
      const ticket = await findTicket(ticketId);
      if (!ticket) return undefined;
      return { id: ticket.id, status: ticket.status, title: ticket.title };
    },

    findTicket,

    async findTicketForReassignment(ticketId) {
      return findTicket(ticketId);
    },

    async isActiveMaintenanceStaff(staffId) {
      const [profile] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.id, staffId),
            eq(profiles.role, 'maintenance'),
            eq(profiles.active, true),
          ),
        )
        .limit(1);
      return profile !== undefined;
    },

    async saveReassignmentIfUnchanged(input) {
      return db.transaction(async (tx) => {
        const [activeStaff] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(
            and(
              eq(profiles.id, input.staffId),
              eq(profiles.role, 'maintenance'),
              eq(profiles.active, true),
            ),
          )
          .for('update');
        if (!activeStaff) return false;

        const [updated] = await tx
          .update(tickets)
          .set({ assigneeId: input.staffId, updatedAt: input.updatedAt })
          .where(
            and(
              eq(tickets.id, input.ticketId),
              eq(tickets.status, input.status),
              eq(tickets.assigneeId, input.previousAssigneeId),
              ticketInBuilding,
            ),
          )
          .returning({ id: tickets.id });
        return updated !== undefined;
      });
    },

    async saveAssignmentIfReported(input) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tickets)
          .set({
            status: 'Assigned',
            assigneeId: input.staffId,
            priority: input.priority,
            dueDate: input.dueDate,
            instructions: input.instructions,
            updatedAt: input.change.createdAt ?? new Date(),
          })
          .where(
            and(eq(tickets.id, input.ticketId), eq(tickets.status, 'Reported'), ticketInBuilding),
          )
          .returning({ id: tickets.id });

        if (!updated) return false;
        await tx.insert(ticketStatusChanges).values(input.change);
        return true;
      });
    },

    async saveReportedDecisionIfUnchanged(input) {
      return db.transaction(async (tx) => {
        const ticketIds = input.duplicateOfId
          ? [input.ticketId, input.duplicateOfId]
          : [input.ticketId];
        const locked = await tx
          .select({
            id: tickets.id,
            status: tickets.status,
          })
          .from(tickets)
          .where(and(inArray(tickets.id, ticketIds), ticketInBuilding))
          .orderBy(asc(tickets.id))
          .for('update');
        const source = locked.find((ticket) => ticket.id === input.ticketId);
        if (!source || source.status !== 'Reported') return false;

        if (input.duplicateOfId) {
          const original = locked.find((ticket) => ticket.id === input.duplicateOfId);
          if (
            input.duplicateOfId === input.ticketId ||
            !original ||
            isFinalTicketStatus(original.status)
          ) {
            return false;
          }
        } else if (input.status === 'Duplicate') {
          return false;
        }

        const [updated] = await tx
          .update(tickets)
          .set({
            status: input.status,
            duplicateOfId: input.duplicateOfId,
            updatedAt: input.change.createdAt ?? new Date(),
          })
          .where(
            and(eq(tickets.id, input.ticketId), eq(tickets.status, 'Reported'), ticketInBuilding),
          )
          .returning({ id: tickets.id });
        if (!updated) return false;

        if (input.status === 'Duplicate' && input.duplicateOfId) {
          const followers = await tx
            .select({ occupancyId: ticketFollowers.occupancyId })
            .from(ticketFollowers)
            .where(eq(ticketFollowers.ticketId, input.ticketId))
            .for('update');
          if (followers.length > 0) {
            await tx
              .insert(ticketFollowers)
              .values(
                followers.map((follower) => ({
                  ticketId: input.duplicateOfId!,
                  occupancyId: follower.occupancyId,
                })),
              )
              .onConflictDoNothing();
            await tx.delete(ticketFollowers).where(eq(ticketFollowers.ticketId, input.ticketId));
          }
        }

        await tx.insert(ticketStatusChanges).values(input.change);
        return true;
      });
    },

    async saveStatusChangeIfFixed(input) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tickets)
          .set({
            status: input.status,
            updatedAt: input.change.createdAt ?? new Date(),
          })
          .where(and(eq(tickets.id, input.ticketId), eq(tickets.status, 'Fixed'), ticketInBuilding))
          .returning({ id: tickets.id });
        if (!updated) return false;
        await tx.insert(ticketStatusChanges).values(input.change);
        return true;
      });
    },

    async listTickets(): Promise<ManagerTicketSnapshot[]> {
      return db
        .select(ticketColumns)
        .from(tickets)
        .leftJoin(flats, eq(flats.id, tickets.flatId))
        .leftJoin(blocks, eq(blocks.id, flats.blockId))
        .leftJoin(commonAreaPlaces, eq(commonAreaPlaces.id, tickets.placeId))
        .where(ticketInBuilding)
        .orderBy(desc(tickets.createdAt));
    },

    async findTicketDetails(ticketId): Promise<ManagerTicketDetailsSnapshot | undefined> {
      const [ticket] = await db
        .select(ticketColumns)
        .from(tickets)
        .leftJoin(flats, eq(flats.id, tickets.flatId))
        .leftJoin(blocks, eq(blocks.id, flats.blockId))
        .leftJoin(commonAreaPlaces, eq(commonAreaPlaces.id, tickets.placeId))
        .where(and(eq(tickets.id, ticketId), ticketInBuilding))
        .limit(1);
      if (!ticket) return undefined;

      const statusChanges: ManagerTicketHistoryEntry[] = await db
        .select({
          fromStatus: ticketStatusChanges.fromStatus,
          toStatus: ticketStatusChanges.toStatus,
          reason: ticketStatusChanges.reason,
          changedAt: ticketStatusChanges.createdAt,
          changedByName: profiles.displayName,
        })
        .from(ticketStatusChanges)
        .innerJoin(profiles, eq(profiles.id, ticketStatusChanges.changedById))
        .where(eq(ticketStatusChanges.ticketId, ticketId))
        .orderBy(asc(ticketStatusChanges.createdAt));

      const notes: ManagerTicketWorkNote[] = await db
        .select({
          id: workNotes.id,
          text: workNotes.text,
          createdAt: workNotes.createdAt,
          authorName: profiles.displayName,
        })
        .from(workNotes)
        .innerJoin(profiles, eq(profiles.id, workNotes.authorId))
        .where(eq(workNotes.ticketId, ticketId))
        .orderBy(asc(workNotes.createdAt));

      return { ticket, statusChanges, workNotes: notes };
    },

    async listActiveMaintenanceStaff() {
      return db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(and(eq(profiles.role, 'maintenance'), eq(profiles.active, true)))
        .orderBy(asc(profiles.displayName));
    },
  };
}

/** The columns shared by the ticket list and details, excluding private account/contact information. */
const ticketColumns = {
  id: tickets.id,
  status: tickets.status,
  priority: tickets.priority,
  assigneeId: tickets.assigneeId,
  dueDate: tickets.dueDate,
  createdAt: tickets.createdAt,
  title: tickets.title,
  category: tickets.category,
  place: sql<string>`coalesce(${commonAreaPlaces.name}, ${blocks.name} || ' / Flat ' || ${flats.number}::text, 'Unknown location')`,
  description: tickets.description,
  photoPath: tickets.photoPath,
  homeTimes: tickets.homeTimes,
  instructions: tickets.instructions,
  foundByStaff: tickets.foundByStaff,
  updatedAt: tickets.updatedAt,
  meTooCount: sql<number>`(
    select count(*)::int from ${ticketFollowers}
    where ${ticketFollowers.ticketId} = ${tickets.id}
      and (${tickets.occupancyId} is null or ${ticketFollowers.occupancyId} <> ${tickets.occupancyId})
  )`,
};

/** Matches flat tickets to the installation's building; common-area places are scoped by the single-building guard. */
function ticketBuildingScope(buildingId: string) {
  return sql`(
    ${tickets.flatId} in (
      select ${flats.id}
      from ${flats}
      inner join ${blocks} on ${blocks.id} = ${flats.blockId}
      where ${blocks.buildingId} = ${buildingId}
    )
    or ${tickets.placeId} is not null
  )`;
}
