/**
 * Database adapter for assignedTicketService.ts: reads tickets assigned to a maintenance worker.
 *
 * @author Adika Rahman
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { blocks, commonAreaPlaces, flats, tickets } from '@/models';
import type { AssignedTicketStore } from '@/services/assignedTicketService';

/**
 * Creates an assigned-ticket store backed by the tickets table.
 *
 * @param db - Database connection to use.
 * @returns The assigned-ticket store.
 */
export function databaseAssignedTicketStore(db: Database): AssignedTicketStore {
  return {
    async listForAssignee(assigneeId) {
      return db
        .select({
          id: tickets.id,
          title: tickets.title,
          place: sql<string>`coalesce(
            ${commonAreaPlaces.name},
            ${blocks.name} || ', Flat ' || ${flats.number}
          )`,
          category: tickets.category,
          priority: tickets.priority,
          dueDate: tickets.dueDate,
          status: tickets.status,
        })
        .from(tickets)
        .leftJoin(flats, eq(tickets.flatId, flats.id))
        .leftJoin(blocks, eq(flats.blockId, blocks.id))
        .leftJoin(commonAreaPlaces, eq(tickets.placeId, commonAreaPlaces.id))
        .where(eq(tickets.assigneeId, assigneeId));
    },

    async findForAssignee(ticketId, assigneeId) {
      const rows = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          place: sql<string>`coalesce(
            ${commonAreaPlaces.name},
            ${blocks.name} || ', Flat ' || ${flats.number}
          )`,
          category: tickets.category,
          priority: tickets.priority,
          dueDate: tickets.dueDate,
          status: tickets.status,
          description: tickets.description,
          photoPath: tickets.photoPath,
          homeTimes: tickets.homeTimes,
          instructions: tickets.instructions,
        })
        .from(tickets)
        .leftJoin(flats, eq(tickets.flatId, flats.id))
        .leftJoin(blocks, eq(flats.blockId, blocks.id))
        .leftJoin(commonAreaPlaces, eq(tickets.placeId, commonAreaPlaces.id))
        .where(and(eq(tickets.id, ticketId), eq(tickets.assigneeId, assigneeId)))
        .limit(1);

      return rows[0];
    },
  };
}
