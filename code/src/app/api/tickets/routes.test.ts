/**
 * Role checks for the resident's ticket routes (RES-02, NFR-06): every other role gets 403 and a signed-out request
 * gets 401 on each route (TC-R02-24), and a resident can't cancel another household's ticket (TC-R02-20). The
 * session, database and Storage are replaced with fakes; the role check itself is the real one from
 * `permissions.ts`.
 *
 * @author Mahir Al Kamal
 */
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Profile, Ticket } from '@/models';
import { GET as listMine, POST as report } from '@/app/api/tickets/route';
import { GET as findMatch } from '@/app/api/tickets/match/route';
import { POST as follow } from '@/app/api/tickets/[id]/followers/route';
import { POST as cancel } from '@/app/api/tickets/[id]/cancel/route';
import { GET as formOptions } from '@/app/api/common-area-places/route';
import { makeProfile } from '@/services/testFakes';

const mockTicketId = '0b6f6c1a-2d3e-4f50-8a1b-2c3d4e5f6a7b';
const mockPlaceId = '5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

/** Who is signed in for the current test, or null for nobody. */
let mockSignedIn: Profile | null = null;

jest.mock('@/lib/auth', () => {
  const { checkRole } = jest.requireActual('@/lib/permissions');
  const { AppError } = jest.requireActual('@/lib/errors');
  return {
    requireRole: async (_request: Request, action: string) => {
      if (!mockSignedIn) throw new AppError('UNAUTHORIZED', 'Log in first.');
      return checkRole(mockSignedIn, action);
    },
  };
});
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({}) }));
jest.mock('@/services/auditService', () => ({ databaseAuditWriter: () => async () => {} }));

/** Another household's Reported ticket at the water pump. */
const mockTheirTicket = {
  id: '0b6f6c1a-2d3e-4f50-8a1b-2c3d4e5f6a7b',
  occupancyId: 'occupancy-1B',
  placeId: mockPlaceId,
  flatId: null,
  status: 'Reported',
  createdAt: new Date('2026-11-22T10:00:00+06:00'),
} as unknown as Ticket;

jest.mock('@/lib/adapters/ticketAdapters', () => {
  const store = {
    activeFlatOf: async (occupancyId: string) =>
      occupancyId === 'occupancy-1A' ? 'flat-1A' : null,
    isActivePlace: async () => true,
    saveReported: async () => {},
    ticketsAt: async () => [],
    findById: async (id: string) => (id === mockTicketId ? mockTheirTicket : null),
    isFollowing: async () => false,
    addFollower: async () => {},
    followerCount: async () => 1,
    removeFollower: async () => {},
    cancelReported: async () => true,
    listForHousehold: async () => [],
    activePlaces: async () => [{ id: mockPlaceId, name: 'Water pump' }],
  };
  return {
    databaseTicketStore: () => store,
    ticketDeps: () => ({
      tickets: store,
      photos: { upload: async () => 'photo.jpg', remove: async () => {} },
      audit: async () => {},
    }),
  };
});

/** The Rahman household's resident account. */
const resident = makeProfile({ id: 'resident-1A', role: 'resident', occupancyId: 'occupancy-1A' });

/** A params object as Next passes it to a dynamic route. */
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** A Report a fault form for a fault inside the flat. */
function reportForm(): FormData {
  const form = new FormData();
  form.set('where', 'flat');
  form.set('category', 'Plumbing');
  form.set('title', 'Kitchen sink is leaking');
  form.set('description', 'Water drips from the pipe.');
  return form;
}

/** Every route, called the way a browser would. */
const ROUTES: readonly [string, () => Promise<Response>][] = [
  ['GET /api/tickets', () => listMine(new Request('http://app/api/tickets'))],
  [
    'POST /api/tickets',
    () => report(new Request('http://app/api/tickets', { method: 'POST', body: reportForm() })),
  ],
  [
    'GET /api/tickets/match',
    () =>
      findMatch(
        new Request(`http://app/api/tickets/match?placeId=${mockPlaceId}&category=Plumbing`),
      ),
  ],
  [
    'POST /api/tickets/[id]/followers',
    () =>
      follow(
        new Request('http://app/api/tickets/x/followers', { method: 'POST' }),
        params(mockTicketId),
      ),
  ],
  [
    'POST /api/tickets/[id]/cancel',
    () =>
      cancel(
        new Request('http://app/api/tickets/x/cancel', { method: 'POST' }),
        params(mockTicketId),
      ),
  ],
  [
    'GET /api/common-area-places',
    () => formOptions(new Request('http://app/api/common-area-places')),
  ],
];

describe.each(ROUTES)('%s', (_, call) => {
  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'answers 403 from the role check to a %s (TC-R02-24)',
    async (role) => {
      mockSignedIn = makeProfile({ role, occupancyId: null });
      const response = await call();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE },
      });
    },
  );

  it('answers 401 when signed out (TC-R02-24)', async () => {
    mockSignedIn = null;
    expect((await call()).status).toBe(401);
  });

  it('answers 403 to a resident who must first choose a password (BR-15)', async () => {
    mockSignedIn = { ...resident, mustChangePassword: true };
    expect((await call()).status).toBe(403);
  });

  it('lets a resident past the role check', async () => {
    mockSignedIn = resident;
    const response = await call();
    const body = (await response.json()) as { error?: { message: string } };
    expect(response.status).not.toBe(401);
    expect(body.error?.message).not.toBe(FORBIDDEN_MESSAGE);
  });
});

describe('as a resident', () => {
  beforeEach(() => {
    mockSignedIn = resident;
  });

  it('lists my tickets', async () => {
    const response = await listMine(new Request('http://app/api/tickets'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tickets: [] });
  });

  it('reports a fault inside my flat with 201', async () => {
    const response = await report(
      new Request('http://app/api/tickets', { method: 'POST', body: reportForm() }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ticket: { status: string; flatId: string } };
    expect(body.ticket).toMatchObject({ status: 'Reported', flatId: 'flat-1A' });
  });

  it('answers 400 to a body that is not a form', async () => {
    const response = await report(
      new Request('http://app/api/tickets', { method: 'POST', body: '{"where":"flat"}' }),
    );
    expect(response.status).toBe(400);
  });

  it("refuses to cancel another household's ticket that mine doesn't follow (403, TC-R02-20)", async () => {
    const response = await cancel(
      new Request('http://app/api/tickets/x/cancel', { method: 'POST' }),
      params(mockTicketId),
    );
    expect(response.status).toBe(403);
  });

  it('answers 404 to a ticket id that is not a UUID', async () => {
    const response = await follow(
      new Request('http://app/api/tickets/1/followers', { method: 'POST' }),
      params('1'),
    );
    expect(response.status).toBe(404);
  });

  it('answers a match query with no open ticket as null match and relation', async () => {
    const response = await findMatch(
      new Request(`http://app/api/tickets/match?placeId=${mockPlaceId}&category=Plumbing`),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ match: null, relation: null });
  });

  it('answers 400 to a match query with no place', async () => {
    const response = await findMatch(new Request('http://app/api/tickets/match?category=Lift'));
    expect(response.status).toBe(400);
  });

  it('returns the places and categories for the form', async () => {
    const response = await formOptions(new Request('http://app/api/common-area-places'));
    await expect(response.json()).resolves.toMatchObject({
      places: [{ id: mockPlaceId, name: 'Water pump' }],
    });
  });
});
