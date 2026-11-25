/**
 * Tests for shaping a ticket for the resident's routes: only the screen's fields leave the server (NFR-06).
 *
 * @author Mahir Al Kamal
 */
import { toTicketView } from '@/lib/ticketResponse';
import type { Ticket } from '@/models/Ticket';

/** A neighbour's assigned ticket at the water pump, with every field filled in. */
const theirs: Ticket = {
  id: 'ticket-1',
  reportedById: 'resident-1B',
  occupancyId: 'occupancy-1B',
  category: 'Plumbing',
  flatId: null,
  placeId: 'place-pump',
  title: 'Water pump trips the breaker',
  description: 'The pump stops every few minutes.',
  photoPath: 'tickets/ticket-1.jpg',
  homeTimes: 'After 6 pm',
  status: 'Assigned',
  priority: 'Urgent',
  assigneeId: 'staff-1',
  dueDate: '2026-11-26',
  instructions: 'Check the breaker first.',
  foundByStaff: false,
  linkedTicketId: null,
  duplicateOfId: null,
  createdAt: new Date('2026-11-20T10:00:00+06:00'),
  updatedAt: new Date('2026-11-21T09:30:00+06:00'),
};

describe('toTicketView', () => {
  it('keeps only the fields the resident screens show, with ISO dates', () => {
    expect(toTicketView(theirs)).toEqual({
      id: 'ticket-1',
      title: 'Water pump trips the breaker',
      category: 'Plumbing',
      status: 'Assigned',
      placeId: 'place-pump',
      dueDate: '2026-11-26',
      createdAt: '2026-11-20T04:00:00.000Z',
      updatedAt: '2026-11-21T03:30:00.000Z',
    });
  });

  it.each([
    'reportedById',
    'occupancyId',
    'description',
    'photoPath',
    'homeTimes',
    'assigneeId',
    'instructions',
  ])("never sends the neighbour's %s", (field) => {
    expect(toTicketView(theirs)).not.toHaveProperty(field);
  });

  it('keeps a missing title and due date as null', () => {
    expect(toTicketView({ ...theirs, title: null, dueDate: null })).toMatchObject({
      title: null,
      dueDate: null,
    });
  });
});
