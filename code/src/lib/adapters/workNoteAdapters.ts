/**
 * Database adapter for saving maintenance work notes on assigned tickets.
 *
 * @author Adika Rahman
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { tickets, workNotes } from '@/models';
import type { WorkNoteStore } from '@/services/workNoteService';

/**
 * Creates a database-backed work-note store.
 *
 * @param db - Database connection to use.
 * @returns A work-note store that saves notes only for currently assigned tickets.
 */
export function databaseWorkNoteStore(db: Database): WorkNoteStore {
  return {
    async createForAssignee(note) {
      return db.transaction(async (tx) => {
        const assignedTicket = await tx
          .select({ id: tickets.id })
          .from(tickets)
          .where(and(eq(tickets.id, note.ticketId), eq(tickets.assigneeId, note.authorId)))
          .for('update')
          .limit(1);

        if (assignedTicket.length === 0) {
          return undefined;
        }

        const saved = await tx.insert(workNotes).values(note).returning();

        return saved[0];
      });
    },
  };
}
