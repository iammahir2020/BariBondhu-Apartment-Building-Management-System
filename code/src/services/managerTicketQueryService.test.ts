/**
 * BB-1306: Manager ticket query service tests.
 *
 * @author Jannatul Ferdus Nishi
 */
import type { ManagerTicketSnapshot } from './managerTicketQueryService';
import {
  getManagerTicketDetails,
  listManagerMaintenanceStaff,
  listManagerTickets,
  type ManagerTicketQueryStore,
} from './managerTicketQueryService';

const NOW = new Date('2026-11-26T08:00:00.000Z');

function makeTicket(overrides: Partial<ManagerTicketSnapshot> = {}): ManagerTicketSnapshot {
  return {
    id: 'ticket-1',
    status: 'Reported',
    priority: 'Normal',
    assigneeId: null,
    dueDate: null,
    createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000 - 1),
    title: 'Water leak',
    category: 'Plumbing',
    place: 'A / Flat 1',
    description: 'A pipe is leaking.',
    photoPath: null,
    homeTimes: null,
    instructions: null,
    foundByStaff: false,
    meTooCount: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeStore(overrides: Partial<ManagerTicketQueryStore> = {}): ManagerTicketQueryStore {
  return {
    listTickets: jest.fn().mockResolvedValue([makeTicket()]),
    findTicketDetails: jest.fn().mockResolvedValue({
      ticket: makeTicket(),
      statusChanges: [],
      workNotes: [],
    }),
    listActiveMaintenanceStaff: jest
      .fn()
      .mockResolvedValue([{ id: 'staff-1', displayName: 'Ayesha Rahman' }]),
    ...overrides,
  };
}

describe('BB-1306: manager ticket queries', () => {
  it('uses the shared late and overdue rules for every list row', async () => {
    const store = makeStore({
      listTickets: jest.fn().mockResolvedValue([
        makeTicket(),
        makeTicket({
          id: 'ticket-2',
          priority: 'Urgent',
          createdAt: new Date(NOW.getTime() - 60 * 60 * 1000 - 1),
          dueDate: '2026-11-25',
          status: 'Assigned',
          assigneeId: 'staff-1',
        }),
        makeTicket({
          id: 'ticket-3',
          priority: 'Normal',
          createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
        }),
      ]),
    });

    await expect(listManagerTickets(store, NOW)).resolves.toMatchObject([
      { id: 'ticket-1', late: true, overdue: false },
      { id: 'ticket-2', late: false, overdue: true },
      { id: 'ticket-3', late: false, overdue: false },
    ]);
  });

  it('returns the active maintenance staff options from the store', async () => {
    const store = makeStore();
    await expect(listManagerMaintenanceStaff(store)).resolves.toEqual([
      { id: 'staff-1', displayName: 'Ayesha Rahman' },
    ]);
    expect(store.listActiveMaintenanceStaff).toHaveBeenCalledTimes(1);
  });

  it('loads status history and notes while adding the same flags as the list', async () => {
    const details = {
      ticket: makeTicket(),
      statusChanges: [
        {
          fromStatus: null,
          toStatus: 'Reported' as const,
          reason: null,
          changedAt: NOW,
          changedByName: 'Nasrin Sultana',
        },
      ],
      workNotes: [
        {
          id: 'note-1',
          text: 'Checked the pipe.',
          createdAt: NOW,
          authorName: 'Ayesha Rahman',
        },
      ],
    };
    const store = makeStore({ findTicketDetails: jest.fn().mockResolvedValue(details) });

    await expect(getManagerTicketDetails(store, 'ticket-1', NOW)).resolves.toEqual({
      ...details,
      ticket: { ...details.ticket, late: true, overdue: false },
    });
    expect(store.findTicketDetails).toHaveBeenCalledWith('ticket-1');
  });

  it('hides out-of-building and missing tickets as not found', async () => {
    const store = makeStore({ findTicketDetails: jest.fn().mockResolvedValue(undefined) });

    await expect(
      getManagerTicketDetails(store, 'other-building-ticket', NOW),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ticket not found.',
    });
  });

  it('rejects a blank ticket identifier before querying the store', async () => {
    const store = makeStore();

    await expect(getManagerTicketDetails(store, '   ', NOW)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid ticket ID.',
    });
    expect(store.findTicketDetails).not.toHaveBeenCalled();
  });
});
