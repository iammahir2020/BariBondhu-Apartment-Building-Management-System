/**
 * Tests for reporting a fault (RES-02, NFR-09): inside my flat and in a common area, the emergency path, the
 * wording for missing input, the photo rules, and nothing left behind when a report fails. Case IDs are from
 * `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { Profile } from '@/models';
import {
  MAX_PHOTO_BYTES,
  REPORT_ERRORS,
  isAcceptedPhoto,
  reportFault,
  type NewReportedTicket,
  type PhotoStore,
  type ReportFaultInput,
  type TicketDeps,
  type TicketPhoto,
  type TicketStore,
} from '@/services/ticketService';
import { makeProfile, memoryAudit } from '@/services/testFakes';

const NOW = new Date('2026-11-23T10:00:00+06:00');

/** An in-memory ticket store: flat 1A for occupancy-1A, an active Lift 1 and a switched-off Roof. */
class MemoryTicketStore implements TicketStore {
  readonly saved: NewReportedTicket[] = [];
  failSave = false;
  flats = new Map([['occupancy-1A', 'flat-1A']]);
  places = new Map([
    ['place-lift-1', true],
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
} {
  const tickets = new MemoryTicketStore();
  const photos = new MemoryPhotoStore();
  const { audit, entries } = memoryAudit();
  let n = 0;
  const deps: TicketDeps = { tickets, photos, audit, newId: () => `id-${++n}` };
  return { deps, tickets, photos, entries };
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
    const ticket = await reportFault(deps, resident, flatReport(), NOW);

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
    const ticket = await reportFault(
      deps,
      resident,
      flatReport({ title: '  Sink  ', description: '  Leaks  ', homeTimes: '   ' }),
      NOW,
    );
    expect(ticket).toMatchObject({ title: 'Sink', description: 'Leaks', homeTimes: null });
  });

  it('makes real ids when none are given, and needs no home times', async () => {
    const { tickets, photos } = setup();
    const { audit } = memoryAudit();
    const ticket = await reportFault(
      { tickets, photos, audit },
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
    const ticket = await reportFault(deps, resident, commonReport(), NOW);

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
    const ticket = await reportFault(
      deps,
      resident,
      commonReport({ category: 'Fire or gas smell', emergency: true }),
      NOW,
    );
    expect(ticket).toMatchObject({ status: 'Reported', priority: 'Urgent' });
  });

  it('makes "Log it for repair" for someone stuck in a lift an Urgent Lift ticket (TC-R02-11)', async () => {
    const { deps } = setup();
    const ticket = await reportFault(deps, resident, commonReport({ emergency: true }), NOW);
    expect(ticket).toMatchObject({ category: 'Lift', priority: 'Urgent' });
  });

  it('makes a fire or gas smell Urgent even when it is not sent from the emergency screen', async () => {
    const { deps } = setup();
    const ticket = await reportFault(
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
    const ticket = await reportFault(deps, resident, flatReport({ photo: jpg() }), NOW);
    expect(ticket.photoPath).toBe('tickets/id-1.jpg');
    expect(photos.stored.has('tickets/id-1.jpg')).toBe(true);
  });

  it('accepts a JPG or PNG of exactly 5 MB (TC-R02-15)', async () => {
    const { deps } = setup();
    await expect(
      reportFault(deps, resident, flatReport({ photo: jpg(MAX_PHOTO_BYTES) }), NOW),
    ).resolves.toMatchObject({ status: 'Reported' });
    await expect(
      reportFault(deps, resident, flatReport({ photo: png(MAX_PHOTO_BYTES) }), NOW),
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
