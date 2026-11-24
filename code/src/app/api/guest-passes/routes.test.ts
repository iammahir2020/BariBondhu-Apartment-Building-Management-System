/**
 * Role checks and behaviour of the resident's guest pass routes (RES-03, NFR-06): every other role gets 403 and a
 * signed-out request gets 401 on each route (TC-R03-24), a resident can create, list and cancel their own passes,
 * and can't cancel another household's (TC-R03-23). The session and database are replaced with fakes; the role
 * check and the guest pass service are the real ones.
 *
 * @author Mahir Al Kamal
 */
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { GuestPass, Profile } from '@/models';
import { GET as listMine, POST as create } from '@/app/api/guest-passes/route';
import { POST as cancel } from '@/app/api/guest-passes/[id]/cancel/route';
import { CANCEL_PASS_ERRORS, PASS_ERRORS } from '@/services/guestPassService';
import { makeProfile } from '@/services/testFakes';

const mockTheirPassId = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

/** Who is signed in for the current test, or null for nobody. */
let mockSignedIn: Profile | null = null;

/** The passes the fake database holds. */
const mockPasses: GuestPass[] = [];

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

jest.mock('@/lib/adapters/guestPassAdapters', () => {
  const store = {
    activeFlatOf: async (occupancyId: string) =>
      occupancyId === 'occupancy-1A' ? 'flat-1A' : null,
    passesWithCode: async (code: string) => mockPasses.filter((p) => p.code === code),
    insert: async (pass: GuestPass) => {
      mockPasses.push(pass);
    },
    findById: async (id: string) => mockPasses.find((p) => p.id === id) ?? null,
    listForOccupancy: async (occupancyId: string) =>
      mockPasses.filter((p) => p.occupancyId === occupancyId),
    cancelIfLive: async (id: string, at: Date) => {
      const pass = mockPasses.find((p) => p.id === id);
      if (!pass || pass.cancelledAt) return false;
      pass.cancelledAt = at;
      return true;
    },
  };
  return {
    databaseGuestPassStore: () => store,
    guestPassDeps: () => ({ passes: store, audit: async () => {} }),
  };
});

/** The Rahman household's resident account. */
const resident = makeProfile({ id: 'resident-1A', role: 'resident', occupancyId: 'occupancy-1A' });

const HOUR = 60 * 60 * 1000;

/** A params object as Next passes it to a dynamic route. */
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** A POST with a JSON body. */
function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A New guest pass form for 3 guests, starting in an hour and lasting 4 hours. */
function newPass(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const start = Date.now() + HOUR;
  return {
    guestName: 'Karim Uncle',
    guestCount: 3,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 4 * HOUR).toISOString(),
    ...overrides,
  };
}

/** Another household's live pass. */
function theirPass(): GuestPass {
  const start = new Date(Date.now() - HOUR);
  return {
    id: mockTheirPassId,
    occupancyId: 'occupancy-1B',
    createdById: 'resident-1B',
    guestName: 'Their guest',
    guestCount: 2,
    startsAt: start,
    endsAt: new Date(start.getTime() + 4 * HOUR),
    code: '123456',
    guestsUsed: 0,
    cancelledAt: null,
    createdAt: start,
  };
}

beforeEach(() => {
  mockPasses.length = 0;
});

/** Every route, called the way a browser would. */
const ROUTES: readonly [string, () => Promise<Response>][] = [
  ['GET /api/guest-passes', () => listMine(new Request('http://app/api/guest-passes'))],
  ['POST /api/guest-passes', () => create(post('http://app/api/guest-passes', newPass()))],
  [
    'POST /api/guest-passes/[id]/cancel',
    () => cancel(post('http://app/api/guest-passes/x/cancel', {}), params(mockTheirPassId)),
  ],
];

describe.each(ROUTES)('%s', (_, call) => {
  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'answers 403 from the role check to a %s (TC-R03-24)',
    async (role) => {
      mockSignedIn = makeProfile({ role, occupancyId: null });
      const response = await call();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE },
      });
    },
  );

  it('answers 401 when signed out (TC-R03-24)', async () => {
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

  it('creates a pass with 201 and a 6-digit code, without the household ids (TC-R03-01)', async () => {
    const response = await create(post('http://app/api/guest-passes', newPass()));
    expect(response.status).toBe(201);
    const { pass } = (await response.json()) as { pass: Record<string, unknown> };
    expect(pass).toMatchObject({
      guestName: 'Karim Uncle',
      guestCount: 3,
      guestsUsed: 0,
      status: 'Scheduled',
      cancelledAt: null,
    });
    expect(pass.code).toMatch(/^\d{6}$/);
    expect(pass).not.toHaveProperty('occupancyId');
    expect(pass).not.toHaveProperty('createdById');
  });

  it('accepts the number of guests as a string of digits from a form field', async () => {
    const response = await create(
      post('http://app/api/guest-passes', newPass({ guestCount: '2' })),
    );
    expect(response.status).toBe(201);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['no guest name', { guestName: undefined }, PASS_ERRORS.guestName],
    ['a guest name that is not text', { guestName: 42 }, PASS_ERRORS.guestName],
    ['21 guests', { guestCount: 21 }, PASS_ERRORS.guestCount],
    ['a number of guests that is not a number', { guestCount: 'three' }, PASS_ERRORS.guestCount],
    ['no start', { startsAt: '' }, PASS_ERRORS.times],
    ['a start that is not a time', { startsAt: 'tomorrow' }, PASS_ERRORS.times],
    ['an end that is not text', { endsAt: 5 }, PASS_ERRORS.times],
  ])('answers 400 to %s, with the service wording', async (_, overrides, message) => {
    const response = await create(post('http://app/api/guest-passes', newPass(overrides)));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { message } });
  });

  it('answers 400 to a body that is not JSON', async () => {
    const response = await create(post('http://app/api/guest-passes', 'not json'));
    expect(response.status).toBe(400);
  });

  it("lists only my household's passes", async () => {
    mockPasses.push(theirPass());
    await create(post('http://app/api/guest-passes', newPass()));
    const response = await listMine(new Request('http://app/api/guest-passes'));
    expect(response.status).toBe(200);
    const { passes } = (await response.json()) as { passes: { guestName: string }[] };
    expect(passes.map((p) => p.guestName)).toEqual(['Karim Uncle']);
  });

  it('cancels my pass', async () => {
    const created = await create(post('http://app/api/guest-passes', newPass()));
    const { pass } = (await created.json()) as { pass: { id: string } };
    const response = await cancel(
      post('http://app/api/guest-passes/x/cancel', {}),
      params(pass.id),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pass: { id: pass.id, status: 'Cancelled' },
    });
  });

  it('answers 409 with the status when my pass is already cancelled (TC-R03-20)', async () => {
    const created = await create(post('http://app/api/guest-passes', newPass()));
    const { pass } = (await created.json()) as { pass: { id: string } };
    await cancel(post('http://app/api/guest-passes/x/cancel', {}), params(pass.id));
    const again = await cancel(post('http://app/api/guest-passes/x/cancel', {}), params(pass.id));
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({
      error: { message: CANCEL_PASS_ERRORS.Cancelled, details: { status: 'Cancelled' } },
    });
  });

  it("refuses to cancel another household's pass (403, TC-R03-23)", async () => {
    mockPasses.push(theirPass());
    const response = await cancel(
      post('http://app/api/guest-passes/x/cancel', {}),
      params(mockTheirPassId),
    );
    expect(response.status).toBe(403);
    expect(mockPasses[0]?.cancelledAt).toBeNull();
  });

  it('answers 404 to an id that is not a UUID', async () => {
    const response = await cancel(
      post('http://app/api/guest-passes/x/cancel', {}),
      params('not-an-id'),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: CANCEL_PASS_ERRORS.notFound },
    });
  });

  it('answers 404 to a pass that does not exist', async () => {
    const response = await cancel(
      post('http://app/api/guest-passes/x/cancel', {}),
      params(mockTheirPassId),
    );
    expect(response.status).toBe(404);
  });
});
