/**
 * Tests for recording maintenance work notes.
 *
 * @author Adika Rahman
 */
import type { NewWorkNote, WorkNote } from '@/models';
import {
  addMyAssignedTicketWorkNote,
  MAX_WORK_NOTE_LENGTH,
  type WorkNoteStore,
} from './workNoteService';

const NOW = new Date('2026-11-26T08:00:00.000Z');

/** In-memory work-note store for service tests. */
class MemoryWorkNotes implements WorkNoteStore {
  readonly saved: WorkNote[] = [];
  assigned = true;

  /**
   * Saves a note when the ticket belongs to the author.
   *
   * @param note - The note to save.
   * @returns The saved note, or undefined when not assigned.
   */
  async createForAssignee(note: NewWorkNote): Promise<WorkNote | undefined> {
    if (!this.assigned) return undefined;

    const saved: WorkNote = {
      id: `note-${this.saved.length + 1}`,
      ticketId: note.ticketId,
      authorId: note.authorId,
      text: note.text,
      createdAt: note.createdAt ?? NOW,
    };

    this.saved.push(saved);
    return saved;
  }
}

describe('addMyAssignedTicketWorkNote', () => {
  it('saves a note with the ticket, author and time', async () => {
    const store = new MemoryWorkNotes();

    const result = await addMyAssignedTicketWorkNote(
      { workNotes: store },
      'ticket-1',
      'worker-1',
      'Repaired the leaking tap.',
      NOW,
    );

    expect(result).toMatchObject({
      ticketId: 'ticket-1',
      authorId: 'worker-1',
      text: 'Repaired the leaking tap.',
      createdAt: NOW,
    });
    expect(store.saved).toHaveLength(1);
  });

  it.each(['', '   ', '\n\t'])('refuses an empty note (%j) and saves nothing', async (input) => {
    const store = new MemoryWorkNotes();

    await expect(
      addMyAssignedTicketWorkNote({ workNotes: store }, 'ticket-1', 'worker-1', input, NOW),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Write a note',
    });

    expect(store.saved).toHaveLength(0);
  });

  it('accepts a note of exactly 1,000 characters', async () => {
    const store = new MemoryWorkNotes();
    const input = 'a'.repeat(MAX_WORK_NOTE_LENGTH);

    const result = await addMyAssignedTicketWorkNote(
      { workNotes: store },
      'ticket-1',
      'worker-1',
      input,
      NOW,
    );

    expect(result.text).toHaveLength(1000);
    expect(store.saved).toHaveLength(1);
  });

  it('refuses a note longer than 1,000 characters', async () => {
    const store = new MemoryWorkNotes();

    await expect(
      addMyAssignedTicketWorkNote(
        { workNotes: store },
        'ticket-1',
        'worker-1',
        'a'.repeat(1001),
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Keep the note to 1,000 characters or fewer.',
    });

    expect(store.saved).toHaveLength(0);
  });

  it('refuses a ticket that is no longer assigned to the worker', async () => {
    const store = new MemoryWorkNotes();
    store.assigned = false;

    await expect(
      addMyAssignedTicketWorkNote(
        { workNotes: store },
        'ticket-1',
        'worker-1',
        'Work completed.',
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'This ticket is no longer assigned to you',
    });

    expect(store.saved).toHaveLength(0);
  });
});
