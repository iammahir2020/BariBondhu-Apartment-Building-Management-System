/**
 * Tests for what Resident home picks out of the guest pass and ticket lists, and the line under each.
 *
 * @author Mahir Al Kamal
 */
import type { MyTicketView } from '@/components/tickets/ticketView';
import type { GuestPassView } from '@/lib/guestPassResponse';
import { homePass, homeTicket, passLine, passTitle, ticketLine } from './homeView';

const PASS: GuestPassView = {
  id: 'pass-1',
  guestName: 'Rafiq Hasan',
  guestCount: 4,
  guestsUsed: 0,
  startsAt: '2026-11-25T11:00:00.000Z',
  endsAt: '2026-11-25T17:00:00.000Z',
  code: '482913',
  status: 'Scheduled',
  cancelledAt: null,
};

const TICKET: MyTicketView = {
  ticket: {
    id: 'ticket-1',
    title: 'Kitchen tap leaking',
    category: 'Plumbing',
    status: 'Reported',
    placeId: null,
    dueDate: null,
    createdAt: '2026-11-20T04:00:00.000Z',
    updatedAt: '2026-11-20T04:00:00.000Z',
  },
  placeName: null,
  followerCount: 1,
  reportedByMe: true,
};

describe('homePass', () => {
  it('picks the first pass that is still live', () => {
    const expired = { ...PASS, id: 'old', status: 'Expired' as const };
    const partly = { ...PASS, id: 'live', status: 'Partly used' as const };
    expect(homePass([expired, partly])?.id).toBe('live');
  });

  it('falls back to the latest pass when none is live', () => {
    const cancelled = { ...PASS, id: 'latest', status: 'Cancelled' as const };
    const expired = { ...PASS, id: 'older', status: 'Expired' as const };
    expect(homePass([cancelled, expired])?.id).toBe('latest');
  });

  it('returns null when there are no passes', () => {
    expect(homePass([])).toBeNull();
  });
});

describe('passTitle', () => {
  it('adds the rest of the party to the name', () => {
    expect(passTitle(PASS)).toBe('Rafiq Hasan + 3');
  });

  it('shows just the name for one guest', () => {
    expect(passTitle({ ...PASS, guestCount: 1 })).toBe('Rafiq Hasan');
  });
});

describe('passLine', () => {
  it('shows the visit window before anyone has arrived', () => {
    expect(passLine(PASS)).toBe('25 Nov, 5:00 pm to 11:00 pm');
  });

  it('shows how many have arrived once the guards check someone in', () => {
    expect(passLine({ ...PASS, guestsUsed: 2, status: 'Partly used' })).toBe('2 of 4 arrived');
    expect(passLine({ ...PASS, guestsUsed: 4, status: 'Fully used' })).toBe('4 of 4 arrived');
  });
});

describe('homeTicket', () => {
  it('picks the newest ticket still open', () => {
    const closed = {
      ...TICKET,
      ticket: { ...TICKET.ticket, id: 'closed', status: 'Closed' as const },
    };
    const open = {
      ...TICKET,
      ticket: { ...TICKET.ticket, id: 'open', status: 'Assigned' as const },
    };
    expect(homeTicket([closed, open])?.ticket.id).toBe('open');
  });

  it('falls back to the newest ticket when all are finished', () => {
    const closed = {
      ...TICKET,
      ticket: { ...TICKET.ticket, id: 'new', status: 'Closed' as const },
    };
    const cancelled = {
      ...TICKET,
      ticket: { ...TICKET.ticket, id: 'old', status: 'Cancelled' as const },
    };
    expect(homeTicket([closed, cancelled])?.ticket.id).toBe('new');
  });

  it('returns null when there are no tickets', () => {
    expect(homeTicket([])).toBeNull();
  });
});

describe('ticketLine', () => {
  it('shows where the fault is and its kind while open', () => {
    expect(ticketLine(TICKET)).toBe('Inside my flat · Plumbing');
    expect(ticketLine({ ...TICKET, placeName: 'Water pump' })).toBe('Water pump · Plumbing');
  });

  it('shows the due date once assigned with one', () => {
    const assigned = {
      ...TICKET,
      ticket: { ...TICKET.ticket, status: 'Assigned' as const, dueDate: '2026-11-28' },
    };
    expect(ticketLine(assigned)).toBe('Due 28 Nov');
  });

  it('shows when a finished ticket ended', () => {
    const closed = {
      ...TICKET,
      ticket: {
        ...TICKET.ticket,
        status: 'Closed' as const,
        updatedAt: '2026-11-22T04:00:00.000Z',
      },
    };
    expect(ticketLine(closed)).toBe('Closed 22 Nov');
  });
});
