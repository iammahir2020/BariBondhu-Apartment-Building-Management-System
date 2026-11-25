/**
 * Tests for reporting a fault and "Me too" (RES-02, BR-13, NFR-09): inside my flat and in a common area, the match
 * with an open ticket, the emergency path, the wording for missing input, the photo rules, nothing left behind when a
 * report fails, and following a ticket. Case IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type {
  NewTicketFollower,
  NewTicketStatusChange,
  Profile,
  Ticket,
  TicketCategory,
} from '@/models';
import {
  CANCEL_ERRORS,
  MAX_PHOTO_BYTES,
  ME_TOO_ERRORS,
  REPORT_ERRORS,
  cancelTicket,
  findOpenMatch,
  isAcceptedPhoto,
  listMyTickets,
  meToo,
  reportFault,
  reportFormOptions,
  type HouseholdTicket,
  type PlaceOption,
  type NewReportedTicket,
  type PhotoStore,
  type ReportFaultInput,
  type TicketDeps,
  type TicketPhoto,
  type TicketStore,
} from '@/services/ticketService';
import { MANAGER_TICKETS_LINK } from '@/services/ticketNotifications';
import { makeProfile, memoryAudit, memoryNotices } from '@/services/testFakes';

const NOW = new Date('2026-11-23T10:00:00+06:00');

/**
 * An in-memory ticket store: flats 1A and 1B for their households, an active Lift 1 and Water pump, a switched-off
 * Roof, and whatever tickets and followers a test adds.
 */
class MemoryTicketStore implements TicketStore {
  readonly saved: NewReportedTicket[] = [];
  readonly tickets: Ticket[] = [];
  readonly followers: NewTicketFollower[] = [];
  failSave = false;
  flats = new Map([
    ['occupancy-1A', 'flat-1A'],
    ['occupancy-1B', 'flat-1B'],
    ['occupancy-2B', 'flat-2B'],
  ]);
  places = new Map([
    ['place-lift-1', true],
    ['place-pump', true],
    ['place-roof', false],
  ]);

  async activeFlatOf(occupancyId: string): Promise<string | null> {
    return this.flats.get(occupancyId) ?? null;
  }

  async isActivePlace(placeId: string): Promise<boolean> {
    return this.places.get(placeId) ?? false;
  }

  async saveReported(rows: NewReportedTicket): Promise<void> {
    if (this.failSave) throw new Error('database is down');
    this.saved.push(rows);
    this.tickets.push(rows.ticket);
    this.followers.push(rows.follower);
  }

  async ticketsAt(placeId: string, category: TicketCategory): Promise<Ticket[]> {
    return this.tickets
      .filter((t) => t.placeId === placeId && t.category === category)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(ticketId: string): Promise<Ticket | null> {
    return this.tickets.find((t) => t.id === ticketId) ?? null;
  }

  async isFollowing(ticketId: string, occupancyId: string): Promise<boolean> {
    return this.followers.some((f) => f.ticketId === ticketId && f.occupancyId === occupancyId);
  }

  async addFollower(row: NewTicketFollower): Promise<void> {
    if (!(await this.isFollowing(row.ticketId, row.occupancyId))) this.followers.push(row);
  }

  async followerCount(ticketId: string): Promise<number> {
    return this.followers.filter((f) => f.ticketId === ticketId).length;
  }

  readonly changes: NewTicketStatusChange[] = [];

  async removeFollower(ticketId: string, occupancyId: string): Promise<void> {
    const i = this.followers.findIndex(
      (f) => f.ticketId === ticketId && f.occupancyId === occupancyId,
    );
    if (i >= 0) this.followers.splice(i, 1);
  }

  async cancelReported(change: NewTicketStatusChange): Promise<boolean> {
    const ticket = this.tickets.find((t) => t.id === change.ticketId);
    if (ticket?.status !== 'Reported') return false;
    ticket.status = 'Cancelled';
    this.changes.push(change);
    return true;
  }

  placeNames = new Map([
    ['place-lift-1', 'Lift 1'],
    ['place-pump', 'Water pump'],
    ['place-roof', 'Roof'],
  ]);

  async listForHousehold(occupancyId: string): Promise<HouseholdTicket[]> {
    const mine = this.tickets.filter(
      (t) =>
        t.occupancyId === occupancyId ||
        this.followers.some((f) => f.ticketId === t.id && f.occupancyId === occupancyId),
    );
    return Promise.all(
      mine.map(async (ticket) => ({
        ticket,
        placeName: ticket.placeId ? (this.placeNames.get(ticket.placeId) ?? null) : null,
        followerCount: await this.followerCount(ticket.id),
      })),
    );
  }

  async activePlaces(): Promise<PlaceOption[]> {
    return [...this.places]
      .filter(([, active]) => active)
      .map(([id]) => ({ id, name: this.placeNames.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Adds an existing ticket, reported by another household, that its reporter follows. */
  add(overrides: Partial<Ticket>): Ticket {
    const ticket: Ticket = {
      id: `ticket-${this.tickets.length + 1}`,
      reportedById: 'resident-1B',
      occupancyId: 'occupancy-1B',
      category: 'Plumbing',
      flatId: null,
      placeId: 'place-pump',
      title: 'Water pump trips the breaker',
      description: 'The pump stops every few minutes.',
      photoPath: null,
      homeTimes: null,
      status: 'Reported',
      priority: 'Normal',
      assigneeId: null,
      dueDate: null,
      instructions: null,
      foundByStaff: false,
      linkedTicketId: null,
      duplicateOfId: null,
      createdAt: new Date('2026-11-20T10:00:00+06:00'),
      updatedAt: new Date('2026-11-20T10:00:00+06:00'),
      ...overrides,
    };
    this.tickets.push(ticket);
    if (ticket.occupancyId) {
      this.followers.push({ ticketId: ticket.id, occupancyId: ticket.occupancyId });
    }
    return ticket;
  }
}

/** An in-memory photo store that can be made to fail. */
class MemoryPhotoStore implements PhotoStore {
  readonly stored = new Map<string, TicketPhoto>();
  failUpload = false;

  async upload(photo: TicketPhoto, ticketId: string): Promise<string> {
    if (this.failUpload) throw new AppError('INTERNAL', 'Could not upload the photo.');
    const path = `tickets/${ticketId}.jpg`;
    this.stored.set(path, photo);
    return path;
  }

  async remove(path: string): Promise<void> {
    this.stored.delete(path);
  }
}

/** A JPG of the given size: the JPG start bytes, then zeros. */
function jpg(size = 1000): TicketPhoto {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return { contentType: 'image/jpeg', bytes };
}

/** A PNG of the given size. */
function png(size = 1000): TicketPhoto {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { contentType: 'image/png', bytes };
}

/** The Rahman household's resident account (flat 1A). */
const resident: Profile = makeProfile({
  id: 'resident-1A',
  role: 'resident',
  displayName: 'Rahman family',
  occupancyId: 'occupancy-1A',
});

/** A fault inside my flat, with everything filled in except the photo. */
function flatReport(overrides: Partial<ReportFaultInput> = {}): ReportFaultInput {
  return {
    where: 'flat',
    category: 'Plumbing',
    title: 'Kitchen sink is leaking',
    description: 'Water drips from the pipe under the sink.',
    homeTimes: 'Weekdays after 5 pm',
    ...overrides,
  };
}

/** A fault in a common area. */
function commonReport(overrides: Partial<ReportFaultInput> = {}): ReportFaultInput {
  return {
    where: 'common',
    placeId: 'place-lift-1',
    category: 'Lift',
    title: 'Lift 1 makes a grinding noise',
    description: 'It grinds between the 2nd and 3rd floor.',
    ...overrides,
  };
}

function setup(): {
  deps: TicketDeps;
  tickets: MemoryTicketStore;
  photos: MemoryPhotoStore;
  entries: ReturnType<typeof memoryAudit>['entries'];
  sent: ReturnType<typeof memoryNotices>['sent'];
} {
  const tickets = new MemoryTicketStore();
  const photos = new MemoryPhotoStore();
  const { audit, entries } = memoryAudit();
  const { notices, sent } = memoryNotices();
  let n = 0;
  const deps: TicketDeps = { tickets, photos, audit, notices, newId: () => `id-${++n}` };
  return { deps, tickets, photos, entries, sent };
}

/** Reports a fault that must create a new ticket, and returns that ticket. */
async function reportNew(...args: Parameters<typeof reportFault>): Promise<Ticket> {
  const result = await reportFault(...args);
  if (result.kind !== 'created') throw new Error('Expected a new ticket, got a match');
  return result.ticket;
}

/** Runs a report and returns the AppError it throws, or fails the test if it doesn't throw one. */
async function errorFrom(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('reportFault: inside my flat', () => {
  it('creates a Reported, Normal ticket for my own flat and household (TC-R02-01)', async () => {
    const { deps, tickets } = setup();
    const ticket = await reportNew(deps, resident, flatReport(), NOW);

    expect(ticket).toMatchObject({
      id: 'id-1',
      reportedById: 'resident-1A',
      occupancyId: 'occupancy-1A',
      flatId: 'flat-1A',
      placeId: null,
      category: 'Plumbing',
      title: 'Kitchen sink is leaking',
      description: 'Water drips from the pipe under the sink.',
      homeTimes: 'Weekdays after 5 pm',
      photoPath: null,
      status: 'Reported',
      priority: 'Normal',
      assigneeId: null,
      foundByStaff: false,
      createdAt: NOW,
    });
    expect(tickets.saved).toHaveLength(1);
    expect(tickets.saved[0]?.ticket).toEqual(ticket);
  });

  it('makes my household follow the ticket and starts its history at Reported', async () => {
    const { deps, tickets } = setup();
    await reportFault(deps, resident, flatReport(), NOW);

    expect(tickets.saved[0]?.follower).toEqual({
      id: 'id-2',
      ticketId: 'id-1',
      occupancyId: 'occupancy-1A',
      createdAt: NOW,
    });
    expect(tickets.saved[0]?.statusChange).toEqual({
      id: 'id-3',
      ticketId: 'id-1',
      fromStatus: null,
      toStatus: 'Reported',
      changedById: 'resident-1A',
      reason: null,
      createdAt: NOW,
    });
  });

  it('writes an audit entry for the report (NFR-27)', async () => {
    const { deps, entries } = setup();
    await reportFault(deps, resident, flatReport(), NOW);

    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'ticket.report',
        entityType: 'tickets',
        entityId: 'id-1',
        oldValues: null,
        newValues: {
          category: 'Plumbing',
          flatId: 'flat-1A',
          placeId: null,
          priority: 'Normal',
          status: 'Reported',
        },
      },
    ]);
  });

  it('trims the title, description and home times, and leaves empty home times out', async () => {
    const { deps } = setup();
    const ticket = await reportNew(
      deps,
      resident,
      flatReport({ title: '  Sink  ', description: '  Leaks  ', homeTimes: '   ' }),
      NOW,
    );
    expect(ticket).toMatchObject({ title: 'Sink', description: 'Leaks', homeTimes: null });
  });

  it('makes real ids when none are given, and needs no home times', async () => {
    const { tickets, photos, deps } = setup();
    const { audit } = memoryAudit();
    const ticket = await reportNew(
      { tickets, photos, audit, notices: deps.notices },
      resident,
      flatReport({ homeTimes: undefined }),
    );
    expect(ticket.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ticket.homeTimes).toBeNull();
    expect(tickets.saved[0]?.follower.id).not.toBe(ticket.id);
  });

  it('refuses a flat report that also names a place, and saves nothing (TC-R02-13)', async () => {
    const { deps, tickets } = setup();
    const error = await errorFrom(() =>
      reportFault(deps, resident, flatReport({ placeId: 'place-lift-1' }), NOW),
    );
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.place });
    expect(tickets.saved).toHaveLength(0);
  });

  it('refuses a household that has moved out (BR-09)', async () => {
    const { deps, tickets } = setup();
    tickets.flats.clear();
    const error = await errorFrom(() => reportFault(deps, resident, flatReport(), NOW));
    expect(error).toMatchObject({ status: 403, message: REPORT_ERRORS.household });
  });
});

describe('reportFault: in a common area', () => {
  it('creates a Reported ticket against the place, with no flat (TC-R02-02)', async () => {
    const { deps, tickets } = setup();
    const ticket = await reportNew(deps, resident, commonReport(), NOW);

    expect(ticket).toMatchObject({
      placeId: 'place-lift-1',
      flatId: null,
      occupancyId: 'occupancy-1A',
      status: 'Reported',
      priority: 'Normal',
    });
    expect(tickets.saved[0]?.follower.occupancyId).toBe('occupancy-1A');
  });

  it.each([
    ['no place', { placeId: null }],
    ['an empty place', { placeId: '' }],
  ])('refuses a common-area report with %s (TC-R02-13)', async (_, overrides) => {
    const { deps, tickets } = setup();
    const error = await errorFrom(() => reportFault(deps, resident, commonReport(overrides), NOW));
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.place });
    expect(tickets.saved).toHaveLength(0);
  });

  it.each([
    ['switched off', 'place-roof'],
    ['unknown', 'place-nowhere'],
  ])('refuses a place that is %s (TC-R02-14)', async (_, placeId) => {
    const { deps, tickets } = setup();
    const error = await errorFrom(() =>
      reportFault(deps, resident, commonReport({ placeId }), NOW),
    );
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.place });
    expect(tickets.saved).toHaveLength(0);
  });
});

describe('reportFault: the emergency path', () => {
  it('makes "Log it for repair" for a fire or gas smell an Urgent ticket (TC-R02-11)', async () => {
    const { deps } = setup();
    const ticket = await reportNew(
      deps,
      resident,
      commonReport({ category: 'Fire or gas smell', emergency: true }),
      NOW,
    );
    expect(ticket).toMatchObject({ status: 'Reported', priority: 'Urgent' });
  });

  it('makes "Log it for repair" for someone stuck in a lift an Urgent Lift ticket (TC-R02-11)', async () => {
    const { deps } = setup();
    const ticket = await reportNew(deps, resident, commonReport({ emergency: true }), NOW);
    expect(ticket).toMatchObject({ category: 'Lift', priority: 'Urgent' });
  });

  it('makes a fire or gas smell Urgent even when it is not sent from the emergency screen', async () => {
    const { deps } = setup();
    const ticket = await reportNew(
      deps,
      resident,
      commonReport({ category: 'Fire or gas smell' }),
      NOW,
    );
    expect(ticket.priority).toBe('Urgent');
  });

  it('refuses an emergency with a category that is not an emergency', async () => {
    const { deps, tickets } = setup();
    const error = await errorFrom(() =>
      reportFault(deps, resident, flatReport({ emergency: true }), NOW),
    );
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.emergency });
    expect(tickets.saved).toHaveLength(0);
  });
});

describe('reportFault: missing input', () => {
  it.each(['', '   ', '\n\t'])(
    'refuses an empty description %j with "Describe the problem" and creates nothing (TC-R02-12)',
    async (description) => {
      const { deps, tickets, entries } = setup();
      const error = await errorFrom(() =>
        reportFault(deps, resident, flatReport({ description }), NOW),
      );
      expect(error).toMatchObject({ status: 400, message: 'Describe the problem' });
      expect(tickets.saved).toHaveLength(0);
      expect(entries).toHaveLength(0);
    },
  );

  it.each(['', '   '])(
    'refuses an empty title %j with "Give it a short title" (Decision 1)',
    async (title) => {
      const { deps, tickets } = setup();
      const error = await errorFrom(() => reportFault(deps, resident, flatReport({ title }), NOW));
      expect(error).toMatchObject({ status: 400, message: 'Give it a short title' });
      expect(tickets.saved).toHaveLength(0);
    },
  );

  it('asks for the description first when both are empty', async () => {
    const { deps } = setup();
    const error = await errorFrom(() =>
      reportFault(deps, resident, flatReport({ title: '', description: '' }), NOW),
    );
    expect(error.message).toBe('Describe the problem');
  });
});

describe('reportFault: who can report', () => {
  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { deps, tickets } = setup();
      const staff = makeProfile({ role, occupancyId: null });
      const error = await errorFrom(() => reportFault(deps, staff, flatReport(), NOW));
      expect(error).toMatchObject({ status: 403, message: REPORT_ERRORS.household });
      expect(tickets.saved).toHaveLength(0);
    },
  );

  it('refuses a resident account with no household (403)', async () => {
    const { deps } = setup();
    const error = await errorFrom(() =>
      reportFault(deps, makeProfile({ role: 'resident', occupancyId: null }), flatReport(), NOW),
    );
    expect(error.status).toBe(403);
  });
});

describe('reportFault: the photo (NFR-09)', () => {
  it('stores a JPG and saves its path on the ticket', async () => {
    const { deps, photos } = setup();
    const ticket = await reportNew(deps, resident, flatReport({ photo: jpg() }), NOW);
    expect(ticket.photoPath).toBe('tickets/id-1.jpg');
    expect(photos.stored.has('tickets/id-1.jpg')).toBe(true);
  });

  it('accepts a JPG or PNG of exactly 5 MB (TC-R02-15)', async () => {
    const { deps } = setup();
    await expect(
      reportNew(deps, resident, flatReport({ photo: jpg(MAX_PHOTO_BYTES) }), NOW),
    ).resolves.toMatchObject({ status: 'Reported' });
    await expect(
      reportNew(deps, resident, flatReport({ photo: png(MAX_PHOTO_BYTES) }), NOW),
    ).resolves.toMatchObject({ status: 'Reported' });
  });

  it.each([
    ['one byte over 5 MB', jpg(MAX_PHOTO_BYTES + 1)],
    ['a GIF', { contentType: 'image/gif', bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38]) }],
    ['a PDF', { contentType: 'application/pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }],
    ['a HEIC', { contentType: 'image/heic', bytes: new Uint8Array(1000) }],
    ['a PDF renamed to .jpg', { contentType: 'image/jpeg', bytes: new Uint8Array([0x25, 0x50]) }],
    ['an empty file', { contentType: 'image/png', bytes: new Uint8Array(0) }],
  ])(
    'refuses %s with the photo message and creates no ticket (TC-R02-16)',
    async (_, photo: TicketPhoto) => {
      const { deps, tickets, photos } = setup();
      const error = await errorFrom(() => reportFault(deps, resident, flatReport({ photo }), NOW));
      expect(error).toMatchObject({
        status: 400,
        message: 'Use a JPG or PNG photo of 5 MB or less',
      });
      expect(tickets.saved).toHaveLength(0);
      expect(photos.stored.size).toBe(0);
    },
  );

  it('creates no ticket when the photo upload fails (TC-R02-25)', async () => {
    const { deps, tickets, photos, entries } = setup();
    photos.failUpload = true;
    await expect(reportFault(deps, resident, flatReport({ photo: jpg() }), NOW)).rejects.toThrow(
      'Could not upload the photo.',
    );
    expect(tickets.saved).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('removes the uploaded photo when the ticket cannot be saved (TC-R02-25)', async () => {
    const { deps, tickets, photos, entries } = setup();
    tickets.failSave = true;
    await expect(reportFault(deps, resident, flatReport({ photo: jpg() }), NOW)).rejects.toThrow(
      'database is down',
    );
    expect(photos.stored.size).toBe(0);
    expect(entries).toHaveLength(0);
  });

  it('passes on a save failure without a photo too', async () => {
    const { deps, tickets } = setup();
    tickets.failSave = true;
    await expect(reportFault(deps, resident, flatReport(), NOW)).rejects.toThrow(
      'database is down',
    );
  });

  it('does not upload a photo when another rule fails', async () => {
    const { deps, photos } = setup();
    await errorFrom(() =>
      reportFault(deps, resident, flatReport({ photo: jpg(), description: '' }), NOW),
    );
    expect(photos.stored.size).toBe(0);
  });
});

describe('isAcceptedPhoto', () => {
  it('accepts a type written in capitals', () => {
    expect(isAcceptedPhoto({ ...jpg(), contentType: 'IMAGE/JPEG' })).toBe(true);
  });

  it('refuses a PNG sent as a JPG', () => {
    expect(isAcceptedPhoto({ ...png(), contentType: 'image/jpeg' })).toBe(false);
  });
});

/** A Water pump + Plumbing report from the Rahman household (1A). */
function pumpReport(overrides: Partial<ReportFaultInput> = {}): ReportFaultInput {
  return commonReport({
    placeId: 'place-pump',
    category: 'Plumbing',
    title: 'No water from the pump',
    description: 'The roof tank is empty.',
    ...overrides,
  });
}

describe('reportFault: a common-area fault that is already reported (BR-13)', () => {
  it.each(['Reported', 'Assigned', 'In progress', 'On hold'] as const)(
    'returns the open %s ticket for the same place and category instead of a new one (TC-R02-03)',
    async (status) => {
      const { deps, tickets, entries } = setup();
      const open = tickets.add({ status });
      const result = await reportFault(deps, resident, pumpReport(), NOW);

      expect(result).toEqual({ kind: 'match', ticket: open, relation: 'neighbour' });
      expect(tickets.saved).toHaveLength(0);
      expect(entries).toHaveLength(0);
    },
  );

  it('still counts a Fixed ticket as open until the manager closes it (TC-R02-05)', async () => {
    const { deps, tickets } = setup();
    const fixed = tickets.add({ status: 'Fixed' });
    await expect(reportFault(deps, resident, pumpReport(), NOW)).resolves.toEqual({
      kind: 'match',
      ticket: fixed,
      relation: 'neighbour',
    });
  });

  it.each(['Closed', 'Cancelled', 'Duplicate', "Won't fix"] as const)(
    'creates a new ticket when the only one for that place and category is %s (TC-R02-06)',
    async (status) => {
      const { deps, tickets } = setup();
      tickets.add({ status });
      const ticket = await reportNew(deps, resident, pumpReport(), NOW);
      expect(ticket).toMatchObject({ placeId: 'place-pump', status: 'Reported' });
    },
  );

  it('creates a new ticket for the same place with a different category (TC-R02-07)', async () => {
    const { deps, tickets } = setup();
    tickets.add({ placeId: 'place-lift-1', category: 'Lift', title: 'Lift 1 grinds' });
    const ticket = await reportNew(
      deps,
      resident,
      commonReport({ category: 'Electrical', title: 'Lift 1 light is off' }),
      NOW,
    );
    expect(ticket).toMatchObject({ placeId: 'place-lift-1', category: 'Electrical' });
  });

  it('creates a new ticket for the same category at another place (TC-R02-02)', async () => {
    const { deps, tickets } = setup();
    tickets.add({});
    const ticket = await reportNew(
      deps,
      resident,
      commonReport({ category: 'Plumbing', title: 'Lift 1 floor is wet' }),
      NOW,
    );
    expect(ticket.placeId).toBe('place-lift-1');
  });

  it("tells me when the open ticket is my own household's report", async () => {
    const { deps, tickets } = setup();
    const mine = tickets.add({ reportedById: resident.id, occupancyId: 'occupancy-1A' });
    await expect(reportFault(deps, resident, pumpReport(), NOW)).resolves.toEqual({
      kind: 'match',
      ticket: mine,
      relation: 'reported',
    });
    expect(tickets.saved).toHaveLength(0);
  });

  it('returns the match before uploading a photo', async () => {
    const { deps, tickets, photos } = setup();
    tickets.add({});
    const result = await reportFault(deps, resident, pumpReport({ photo: jpg() }), NOW);
    expect(result.kind).toBe('match');
    expect(photos.stored.size).toBe(0);
  });

  it('never matches a fault inside a flat, even with the same category', async () => {
    const { deps, tickets } = setup();
    tickets.add({});
    await expect(reportNew(deps, resident, flatReport(), NOW)).resolves.toMatchObject({
      flatId: 'flat-1A',
    });
  });
});

describe('findOpenMatch', () => {
  it('picks the oldest open ticket when there are several', async () => {
    const { tickets } = setup();
    tickets.add({ id: 'newer', createdAt: new Date('2026-11-22T10:00:00+06:00') });
    tickets.add({ id: 'older', createdAt: new Date('2026-11-19T10:00:00+06:00') });
    tickets.add({
      id: 'closed',
      status: 'Closed',
      createdAt: new Date('2026-11-01T10:00:00+06:00'),
    });
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toMatchObject(
      { ticket: { id: 'older' } },
    );
  });

  it('returns null when nothing is reported there', async () => {
    const { tickets } = setup();
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toBeNull();
  });

  it("says it is a neighbour's when another household reported it and mine doesn't follow it", async () => {
    const { tickets } = setup();
    tickets.add({});
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toMatchObject(
      { relation: 'neighbour' },
    );
  });

  it('says my household reported it when the open ticket is our own report', async () => {
    const { tickets } = setup();
    tickets.add({ reportedById: resident.id, occupancyId: 'occupancy-1A' });
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toMatchObject(
      { relation: 'reported' },
    );
  });

  it("says my household follows it after a Me too on a neighbour's ticket", async () => {
    const { tickets } = setup();
    const theirs = tickets.add({});
    tickets.followers.push({ ticketId: theirs.id, occupancyId: 'occupancy-1A' });
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toMatchObject(
      { relation: 'following' },
    );
  });

  it('counts a report by someone else in my household as ours', async () => {
    const { tickets } = setup();
    tickets.add({ reportedById: 'resident-1A-other', occupancyId: 'occupancy-1A' });
    await expect(findOpenMatch(tickets, resident, 'place-pump', 'Plumbing')).resolves.toMatchObject(
      { relation: 'reported' },
    );
  });

  it('refuses an account with no household (403)', async () => {
    const { tickets } = setup();
    await expect(
      findOpenMatch(
        tickets,
        makeProfile({ role: 'manager', occupancyId: null }),
        'place-pump',
        'Plumbing',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('meToo', () => {
  it('makes my household follow the ticket; the follower count goes up (TC-R02-04)', async () => {
    const { deps, tickets, entries } = setup();
    const open = tickets.add({});
    const result = await meToo(deps, resident, open.id, NOW);

    expect(result).toEqual({ ticket: open, followerCount: 2, alreadyFollowing: false });
    expect(tickets.followers).toContainEqual({
      id: 'id-1',
      ticketId: open.id,
      occupancyId: 'occupancy-1A',
      createdAt: NOW,
    });
    expect(tickets.saved).toHaveLength(0);
    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'ticket.follow',
        entityType: 'tickets',
        entityId: open.id,
        oldValues: null,
        newValues: { occupancyId: 'occupancy-1A' },
      },
    ]);
  });

  it('counts a third household too', async () => {
    const { deps, tickets } = setup();
    const open = tickets.add({});
    await meToo(deps, resident, open.id, NOW);
    const third = makeProfile({ id: 'resident-2B', role: 'resident', occupancyId: 'occupancy-2B' });
    await expect(meToo(deps, third, open.id, NOW)).resolves.toMatchObject({ followerCount: 3 });
  });

  it('works on a Fixed ticket, which is still open (TC-R02-05)', async () => {
    const { deps, tickets } = setup();
    const fixed = tickets.add({ status: 'Fixed' });
    await expect(meToo(deps, resident, fixed.id, NOW)).resolves.toMatchObject({
      alreadyFollowing: false,
    });
  });

  it('changes nothing and shows no error when tapped twice (TC-R02-08)', async () => {
    const { deps, tickets, entries } = setup();
    const open = tickets.add({});
    await meToo(deps, resident, open.id, NOW);
    const again = await meToo(deps, resident, open.id, NOW);

    expect(again).toMatchObject({ followerCount: 2, alreadyFollowing: true });
    expect(tickets.followers.filter((f) => f.occupancyId === 'occupancy-1A')).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it('changes nothing on a ticket my own household reported (TC-R02-08)', async () => {
    const { deps, tickets } = setup();
    const mine = tickets.add({ occupancyId: 'occupancy-1A', reportedById: 'resident-1A' });
    await expect(meToo(deps, resident, mine.id, NOW)).resolves.toMatchObject({
      followerCount: 1,
      alreadyFollowing: true,
    });
  });

  it('refuses a ticket inside a flat (409, TC-R02-09)', async () => {
    const { deps, tickets } = setup();
    const inFlat = tickets.add({ placeId: null, flatId: 'flat-1B' });
    const error = await errorFrom(() => meToo(deps, resident, inFlat.id, NOW));
    expect(error).toMatchObject({ status: 409, message: ME_TOO_ERRORS.notCommonArea });
    expect(await tickets.followerCount(inFlat.id)).toBe(1);
  });

  it.each(['Closed', 'Cancelled', 'Duplicate', "Won't fix"] as const)(
    'refuses a %s ticket (409, TC-R02-09)',
    async (status) => {
      const { deps, tickets, entries } = setup();
      const done = tickets.add({ status });
      const error = await errorFrom(() => meToo(deps, resident, done.id, NOW));
      expect(error).toMatchObject({ status: 409, message: ME_TOO_ERRORS.finished });
      expect(await tickets.followerCount(done.id)).toBe(1);
      expect(entries).toHaveLength(0);
    },
  );

  it('refuses a ticket that does not exist (404)', async () => {
    const { deps } = setup();
    const error = await errorFrom(() => meToo(deps, resident, 'no-such-ticket', NOW));
    expect(error).toMatchObject({ status: 404, message: ME_TOO_ERRORS.notFound });
  });

  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { deps, tickets } = setup();
      const open = tickets.add({});
      const error = await errorFrom(() =>
        meToo(deps, makeProfile({ role, occupancyId: null }), open.id, NOW),
      );
      expect(error.status).toBe(403);
    },
  );

  it('refuses a household that has moved out (403)', async () => {
    const { deps, tickets } = setup();
    const open = tickets.add({});
    tickets.flats.delete('occupancy-1A');
    const error = await errorFrom(() => meToo(deps, resident, open.id, NOW));
    expect(error).toMatchObject({ status: 403, message: REPORT_ERRORS.household });
  });

  it('makes a real id when none is given', async () => {
    const { tickets } = setup();
    const { audit } = memoryAudit();
    const open = tickets.add({});
    await meToo({ tickets, audit }, resident, open.id);
    expect(tickets.followers.at(-1)?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/** A ticket the Rahman household (1A) reported, which it follows. */
function myTicket(tickets: MemoryTicketStore, overrides: Partial<Ticket> = {}): Ticket {
  return tickets.add({
    occupancyId: 'occupancy-1A',
    reportedById: 'resident-1A',
    placeId: null,
    flatId: 'flat-1A',
    title: 'Kitchen sink is leaking',
    ...overrides,
  });
}

/** Another household follows a ticket, as if it tapped "Me too". */
function follow(tickets: MemoryTicketStore, ticketId: string, occupancyId: string): void {
  tickets.followers.push({ ticketId, occupancyId });
}

describe('cancelTicket', () => {
  it('cancels my Reported ticket that nobody else follows (TC-R02-17)', async () => {
    const { deps, tickets, entries } = setup();
    const mine = myTicket(tickets);
    const result = await cancelTicket(deps, resident, mine.id, NOW);

    expect(result).toEqual({
      outcome: 'cancelled',
      ticket: { ...mine, status: 'Cancelled', updatedAt: NOW },
    });
    expect(tickets.tickets[0]?.status).toBe('Cancelled');
    expect(tickets.changes).toEqual([
      {
        id: 'id-1',
        ticketId: mine.id,
        fromStatus: 'Reported',
        toStatus: 'Cancelled',
        changedById: 'resident-1A',
        reason: null,
        createdAt: NOW,
      },
    ]);
    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'ticket.cancel',
        entityType: 'tickets',
        entityId: mine.id,
        oldValues: { status: 'Reported' },
        newValues: { status: 'Cancelled' },
      },
    ]);
  });

  it('cancels my common-area ticket that nobody else follows', async () => {
    const { deps, tickets } = setup();
    const mine = myTicket(tickets, { placeId: 'place-pump', flatId: null });
    await expect(cancelTicket(deps, resident, mine.id, NOW)).resolves.toMatchObject({
      outcome: 'cancelled',
    });
  });

  it('only stops my household following when two other households follow it (TC-R02-18)', async () => {
    const { deps, tickets, entries } = setup();
    const mine = myTicket(tickets, { placeId: 'place-pump', flatId: null });
    follow(tickets, mine.id, 'occupancy-1B');
    follow(tickets, mine.id, 'occupancy-2B');
    const result = await cancelTicket(deps, resident, mine.id, NOW);

    expect(result).toEqual({ outcome: 'unfollowed', ticket: mine });
    expect(tickets.tickets[0]?.status).toBe('Reported');
    expect(await tickets.isFollowing(mine.id, 'occupancy-1A')).toBe(false);
    expect(await tickets.followerCount(mine.id)).toBe(2);
    expect(tickets.changes).toHaveLength(0);
    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'ticket.unfollow',
        entityType: 'tickets',
        entityId: mine.id,
        oldValues: { occupancyId: 'occupancy-1A' },
        newValues: null,
      },
    ]);
  });

  it('changes nothing when I already stopped following and others still follow', async () => {
    const { deps, tickets } = setup();
    const mine = myTicket(tickets, { placeId: 'place-pump', flatId: null });
    follow(tickets, mine.id, 'occupancy-1B');
    await cancelTicket(deps, resident, mine.id, NOW);
    const again = await cancelTicket(deps, resident, mine.id, NOW);

    expect(again.outcome).toBe('unfollowed');
    expect(tickets.tickets[0]?.status).toBe('Reported');
    expect(await tickets.followerCount(mine.id)).toBe(1);
  });

  it('cancels it after the other follower has stopped following', async () => {
    const { deps, tickets } = setup();
    const mine = myTicket(tickets, { placeId: 'place-pump', flatId: null });
    follow(tickets, mine.id, 'occupancy-1B');
    await tickets.removeFollower(mine.id, 'occupancy-1B');
    await expect(cancelTicket(deps, resident, mine.id, NOW)).resolves.toMatchObject({
      outcome: 'cancelled',
    });
  });

  it('lets a household that tapped "Me too" stop following a Reported ticket', async () => {
    const { deps, tickets } = setup();
    const theirs = tickets.add({});
    follow(tickets, theirs.id, 'occupancy-1A');
    const result = await cancelTicket(deps, resident, theirs.id, NOW);

    expect(result.outcome).toBe('unfollowed');
    expect(await tickets.followerCount(theirs.id)).toBe(1);
    expect(tickets.tickets[0]?.status).toBe('Reported');
  });

  it.each(['Assigned', 'In progress', 'On hold', 'Fixed'] as const)(
    'refuses to cancel my %s ticket: only the manager can close it (409, TC-R02-19)',
    async (status) => {
      const { deps, tickets, entries } = setup();
      const mine = myTicket(tickets, { status });
      const error = await errorFrom(() => cancelTicket(deps, resident, mine.id, NOW));

      expect(error).toMatchObject({ status: 409, message: CANCEL_ERRORS.assigned });
      expect(tickets.tickets[0]?.status).toBe(status);
      expect(await tickets.isFollowing(mine.id, 'occupancy-1A')).toBe(true);
      expect(entries).toHaveLength(0);
    },
  );

  it('refuses to stop following an Assigned ticket I tapped "Me too" on (Decision 6)', async () => {
    const { deps, tickets } = setup();
    const theirs = tickets.add({ status: 'Assigned' });
    follow(tickets, theirs.id, 'occupancy-1A');
    const error = await errorFrom(() => cancelTicket(deps, resident, theirs.id, NOW));

    expect(error).toMatchObject({ status: 409, message: CANCEL_ERRORS.assigned });
    expect(await tickets.isFollowing(theirs.id, 'occupancy-1A')).toBe(true);
  });

  it.each(['Closed', 'Cancelled', 'Duplicate', "Won't fix"] as const)(
    'refuses a ticket that is already %s (409)',
    async (status) => {
      const { deps, tickets } = setup();
      const mine = myTicket(tickets, { status });
      const error = await errorFrom(() => cancelTicket(deps, resident, mine.id, NOW));
      expect(error).toMatchObject({ status: 409, message: CANCEL_ERRORS.finished });
    },
  );

  it('refuses when the manager assigns it between my reading and my cancelling (409)', async () => {
    const { deps, tickets, entries } = setup();
    const mine = myTicket(tickets);
    const findById = tickets.findById.bind(tickets);
    tickets.findById = async (id) => {
      const found = await findById(id);
      if (found) tickets.tickets[0] = { ...found, status: 'Assigned' };
      return found;
    };
    const error = await errorFrom(() => cancelTicket(deps, resident, mine.id, NOW));

    expect(error).toMatchObject({ status: 409, message: CANCEL_ERRORS.assigned });
    expect(tickets.changes).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it("refuses another household's ticket that mine doesn't follow (403, TC-R02-20)", async () => {
    const { deps, tickets } = setup();
    const theirs = tickets.add({});
    const error = await errorFrom(() => cancelTicket(deps, resident, theirs.id, NOW));

    expect(error).toMatchObject({ status: 403, message: CANCEL_ERRORS.notYours });
    expect(tickets.tickets[0]?.status).toBe('Reported');
  });

  it('refuses a ticket that does not exist (404)', async () => {
    const { deps } = setup();
    const error = await errorFrom(() => cancelTicket(deps, resident, 'no-such-ticket', NOW));
    expect(error).toMatchObject({ status: 404, message: ME_TOO_ERRORS.notFound });
  });

  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { deps, tickets } = setup();
      const mine = myTicket(tickets);
      const error = await errorFrom(() =>
        cancelTicket(deps, makeProfile({ role, occupancyId: null }), mine.id, NOW),
      );
      expect(error.status).toBe(403);
      expect(tickets.tickets[0]?.status).toBe('Reported');
    },
  );

  it('refuses a household that has moved out (403)', async () => {
    const { deps, tickets } = setup();
    const mine = myTicket(tickets);
    tickets.flats.delete('occupancy-1A');
    const error = await errorFrom(() => cancelTicket(deps, resident, mine.id, NOW));
    expect(error).toMatchObject({ status: 403, message: REPORT_ERRORS.household });
  });

  it('makes a real id when none is given', async () => {
    const { tickets, deps } = setup();
    const { audit } = memoryAudit();
    const mine = myTicket(tickets);
    await cancelTicket({ tickets, audit, notices: deps.notices }, resident, mine.id);
    expect(tickets.changes[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('telling the manager (BB-1211, NFR-29)', () => {
  it('tells the manager about a new fault inside my flat (TC-R02-01)', async () => {
    const { deps, sent } = setup();
    await reportFault(deps, resident, flatReport(), NOW);
    expect(sent).toEqual([
      {
        recipientId: 'manager-1',
        text: 'New fault reported: Kitchen sink is leaking',
        link: MANAGER_TICKETS_LINK,
      },
    ]);
  });

  it('tells the manager an emergency ticket is Urgent (TC-R02-11)', async () => {
    const { deps, sent } = setup();
    const ticket = await reportNew(deps, resident, commonReport({ emergency: true }), NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe(`Urgent fault reported: ${ticket.title}`);
  });

  it('tells nobody when the report matches an open ticket instead (BR-13)', async () => {
    const { deps, tickets, sent } = setup();
    tickets.add({});
    await reportFault(deps, resident, pumpReport(), NOW);
    expect(sent).toEqual([]);
  });

  it('tells nobody when the report is refused', async () => {
    const { deps, sent } = setup();
    await errorFrom(() => reportFault(deps, resident, flatReport({ description: ' ' }), NOW));
    expect(sent).toEqual([]);
  });

  it('tells nobody when the ticket could not be saved', async () => {
    const { deps, tickets, sent } = setup();
    tickets.saveReported = async () => {
      throw new Error('database down');
    };
    await expect(reportFault(deps, resident, flatReport(), NOW)).rejects.toThrow('database down');
    expect(sent).toEqual([]);
  });

  it('still saves the report when the notification fails', async () => {
    const { deps, tickets } = setup();
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failing = {
      ...deps,
      notices: {
        ...deps.notices,
        notify: async () => {
          throw new Error('notifications down');
        },
      },
    };
    await expect(reportFault(failing, resident, flatReport(), NOW)).resolves.toMatchObject({
      kind: 'created',
    });
    expect(tickets.saved).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('tells the manager when I cancel my ticket (TC-R02-17)', async () => {
    const { deps, tickets, sent } = setup();
    const mine = myTicket(tickets);
    await cancelTicket(deps, resident, mine.id, NOW);
    expect(sent).toEqual([
      {
        recipientId: 'manager-1',
        text: `Cancelled by the resident: ${mine.title}`,
        link: MANAGER_TICKETS_LINK,
      },
    ]);
  });

  it('tells nobody when my household only stops following a ticket', async () => {
    const { deps, tickets, sent } = setup();
    const theirs = tickets.add({});
    follow(tickets, theirs.id, 'occupancy-1A');
    await cancelTicket(deps, resident, theirs.id, NOW);
    expect(sent).toEqual([]);
  });

  it('tells nobody when the cancel is refused', async () => {
    const { deps, tickets, sent } = setup();
    const mine = myTicket(tickets, { status: 'Assigned' });
    await errorFrom(() => cancelTicket(deps, resident, mine.id, NOW));
    expect(sent).toEqual([]);
  });
});

describe('listMyTickets', () => {
  it('lists the tickets my household reported and follows, newest first (TC-R02-22)', async () => {
    const { tickets } = setup();
    const reported = myTicket(tickets, { createdAt: new Date('2026-11-21T09:00:00+06:00') });
    const followed = tickets.add({ createdAt: new Date('2026-11-22T09:00:00+06:00') });
    follow(tickets, followed.id, 'occupancy-1A');
    tickets.add({ title: 'Not mine' });

    const list = await listMyTickets(tickets, resident);
    expect(list).toEqual([
      { ticket: followed, placeName: 'Water pump', followerCount: 2, reportedByMe: false },
      { ticket: reported, placeName: null, followerCount: 1, reportedByMe: true },
    ]);
  });

  it('shows each ticket with its current status, final ones too', async () => {
    const { tickets } = setup();
    myTicket(tickets, { status: 'Closed' });
    myTicket(tickets, { status: 'In progress' });
    const list = await listMyTickets(tickets, resident);
    expect(list.map((row) => row.ticket.status).sort()).toEqual(['Closed', 'In progress']);
  });

  it("never shows an earlier household's tickets to a new household in the same flat (TC-R02-23)", async () => {
    const { tickets } = setup();
    myTicket(tickets, { occupancyId: 'occupancy-1A-old', reportedById: 'old-resident' });
    await expect(listMyTickets(tickets, resident)).resolves.toEqual([]);
  });

  it('refuses a non-resident account and a household that has moved out (403)', async () => {
    const { tickets } = setup();
    const staff = makeProfile({ role: 'maintenance', occupancyId: null });
    expect((await errorFrom(() => listMyTickets(tickets, staff))).status).toBe(403);
    tickets.flats.delete('occupancy-1A');
    expect((await errorFrom(() => listMyTickets(tickets, resident))).status).toBe(403);
  });
});

describe('reportFormOptions', () => {
  it('offers only the places that are switched on, and every category (TC-R02-14)', async () => {
    const { tickets } = setup();
    await expect(reportFormOptions(tickets)).resolves.toEqual({
      places: [
        { id: 'place-lift-1', name: 'Lift 1' },
        { id: 'place-pump', name: 'Water pump' },
      ],
      categories: ['Plumbing', 'Electrical', 'Lift', 'Water supply', 'Fire or gas smell', 'Other'],
    });
  });
});
