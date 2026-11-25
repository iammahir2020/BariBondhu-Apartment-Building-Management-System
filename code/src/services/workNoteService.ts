/**
 * Business rules for recording a maintenance worker's notes on assigned tickets.
 *
 * @author Adika Rahman
 */
import { AppError } from '@/lib/errors';
import type { NewWorkNote, WorkNote } from '@/models';

/** Maximum number of characters allowed in a work note. */
export const MAX_WORK_NOTE_LENGTH = 1000;

/** The work-note database operation required by this service. */
export interface WorkNoteStore {
  /**
   * Saves a note only if the ticket is still assigned to its author.
   *
   * @param note - The note to save.
   * @returns The saved note, or undefined if the ticket is not assigned to the author.
   */
  createForAssignee(note: NewWorkNote): Promise<WorkNote | undefined>;
}

/** Dependencies required by the work-note service. */
export interface WorkNoteDeps {
  workNotes: WorkNoteStore;
}

/**
 * Adds a work note to a ticket assigned to the maintenance worker.
 *
 * @param deps - Work-note storage dependency.
 * @param ticketId - The assigned ticket's ID.
 * @param authorId - The maintenance worker's profile ID.
 * @param input - The note text entered by the worker.
 * @param now - The time the note is recorded.
 * @returns The saved work note.
 * @throws AppError BAD_REQUEST when the note is empty or longer than 1,000 characters.
 * @throws AppError FORBIDDEN when the ticket is no longer assigned to the worker.
 */
export async function addMyAssignedTicketWorkNote(
  deps: WorkNoteDeps,
  ticketId: string,
  authorId: string,
  input: string,
  now: Date = new Date(),
): Promise<WorkNote> {
  const text = input.trim();

  if (text === '') {
    throw new AppError('BAD_REQUEST', 'Write a note');
  }

  if (text.length > MAX_WORK_NOTE_LENGTH) {
    throw new AppError('BAD_REQUEST', 'Keep the note to 1,000 characters or fewer.');
  }

  const saved = await deps.workNotes.createForAssignee({
    ticketId,
    authorId,
    text,
    createdAt: now,
  });

  if (!saved) {
    throw new AppError('FORBIDDEN', 'This ticket is no longer assigned to you');
  }

  return saved;
}
