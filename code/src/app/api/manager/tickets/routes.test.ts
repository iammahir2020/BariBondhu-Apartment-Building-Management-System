/**
 * BB-1306: Manager ticket API tests for actions, validation, building-scoped misses and authorization.
 *
 * @author Jannatul Ferdus Nishi
 */
import { POST as assignTicket } from './[id]/assign/route';
import { POST as closeTicket } from './[id]/close/route';
import { POST as decideTicket } from './[id]/decision/route';
import { GET as getTicketPhoto } from './[id]/photo/route';
import { GET as getTicket } from './[id]/route';
import { POST as reopenTicket } from './[id]/reopen/route';
import { GET as listTickets } from './route';

import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Profile } from '@/models';
import { makeProfile } from '@/services/testFakes';

const TICKET_ID = '123e4567-e89b-42d3-a456-426614174000';
const ORIGINAL_ID = '223e4567-e89b-42d3-a456-426614174000';
const STAFF_ID = '323e4567-e89b-42d3-a456-426614174000';

let mockSignedIn: Profile | null = null;
const mockDatabaseManagerTicketContext = jest.fn();
const mockSignedUrlForTicket = jest.fn();

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

jest.mock('@/lib/adapters/managerTicketAdapters', () => ({
  databaseManagerTicketContext: (...args: unknown[]) => mockDatabaseManagerTicketContext(...args),
  managerTicketPhotoStore: () => ({ signedUrlForTicket: mockSignedUrlForTicket }),
}));

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    status: 'Reported',
    priority: 'Normal',
    assigneeId: null,
    dueDate: null,
    createdAt: new Date('2999-01-01T00:00:00Z'),
    title: 'Water leak',
    category: 'Plumbing',
    place: 'A / Flat 1',
    description: 'A pipe is leaking.',
    photoPath: null,
    homeTimes: null,
    instructions: null,
    foundByStaff: false,
    meTooCount: 0,
    updatedAt: new Date('2999-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeContext() {
  const ticket = makeTicket();
  const store = {
    listTickets: jest.fn().mockResolvedValue([ticket]),
    findTicketDetails: jest.fn().mockResolvedValue({
      ticket,
      statusChanges: [],
      workNotes: [],
    }),
    listActiveMaintenanceStaff: jest
      .fn()
      .mockResolvedValue([{ id: STAFF_ID, displayName: 'Ayesha Rahman' }]),
    findTicketForAssignment: jest.fn().mockResolvedValue({
      id: TICKET_ID,
      status: 'Reported',
      title: 'Water leak',
    }),
    isActiveMaintenanceStaff: jest.fn().mockResolvedValue(true),
    saveAssignmentIfReported: jest.fn().mockResolvedValue(true),
    findTicket: jest.fn().mockImplementation(async (id: string) => ({
      id,
      status: 'Reported',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    })),
    saveReportedDecisionIfUnchanged: jest.fn().mockResolvedValue(true),
    saveStatusChangeIfFixed: jest.fn().mockResolvedValue(true),
  };
  const context = {
    tickets: store,
    audit: jest.fn().mockResolvedValue(undefined),
    notices: {
      recipients: {
        activeManagerIds: jest.fn().mockResolvedValue([]),
        followerAccountIds: jest.fn().mockResolvedValue(['resident-1']),
      },
      notify: jest.fn().mockResolvedValue(undefined),
    },
  };
  return { context, store };
}

function request(method: 'GET' | 'POST', body?: unknown): Request {
  return new Request('http://localhost:3000/api/manager/tickets', {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

function routeContext(id = TICKET_ID) {
  return { params: Promise.resolve({ id }) };
}

const protectedRoutes: Array<[string, () => Promise<Response>]> = [
  ['list', () => listTickets(request('GET'))],
  ['details', () => getTicket(request('GET'), routeContext())],
  ['photo', () => getTicketPhoto(request('GET'), routeContext())],
  [
    'assignment',
    () =>
      assignTicket(
        request('POST', {
          staffId: STAFF_ID,
          priority: 'High',
          dueDate: '2099-12-01',
        }),
        routeContext(),
      ),
  ],
  [
    'decision',
    () =>
      decideTicket(request('POST', { decision: "Won't fix", reason: 'Reviewed' }), routeContext()),
  ],
  ['close', () => closeTicket(request('POST'), routeContext())],
  [
    'reopen',
    () => reopenTicket(request('POST', { reason: 'The repair did not last.' }), routeContext()),
  ],
];

describe('BB-1306 manager ticket API routes', () => {
  let context: ReturnType<typeof makeContext>['context'];
  let store: ReturnType<typeof makeContext>['store'];

  beforeEach(() => {
    mockSignedIn = null;
    ({ context, store } = makeContext());
    mockDatabaseManagerTicketContext.mockReset().mockResolvedValue(context);
    mockSignedUrlForTicket.mockReset().mockResolvedValue('https://storage.example/signed-photo');
  });

  it('lists in-scope tickets with late/overdue flags and staff options for assignment', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await listTickets(request('GET'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tickets: [{ id: TICKET_ID, late: false, overdue: false }],
      maintenanceStaff: [{ id: STAFF_ID, displayName: 'Ayesha Rahman' }],
    });
    expect(mockDatabaseManagerTicketContext).toHaveBeenCalledTimes(1);
  });

  it('returns one ticket with its BM-07 history and notes', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await getTicket(request('GET'), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ticket: {
        ticket: { id: TICKET_ID },
        statusChanges: [],
        workNotes: [],
      },
    });
  });

  it('hides a missing or out-of-building detail as 404', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.findTicketDetails.mockResolvedValueOnce(undefined);

    const response = await getTicket(request('GET'), routeContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Ticket not found.' },
    });
  });

  it('returns a signed URL only for a manager-visible ticket photo', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await getTicketPhoto(request('GET'), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://storage.example/signed-photo',
    });
    expect(mockSignedUrlForTicket).toHaveBeenCalledWith(TICKET_ID);
  });

  it('returns 404 when an in-scope ticket has no photo', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    mockSignedUrlForTicket.mockResolvedValueOnce(undefined);

    const response = await getTicketPhoto(request('GET'), routeContext());

    expect(response.status).toBe(404);
  });

  it('rejects malformed ticket IDs before opening the database context', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await getTicket(request('GET'), routeContext('not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mockDatabaseManagerTicketContext).not.toHaveBeenCalled();
  });

  it('assigns the authenticated manager, staff, priority, due date, and instructions', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await assignTicket(
      request('POST', {
        staffId: STAFF_ID,
        priority: 'High',
        dueDate: '2099-12-01',
        instructions: 'Check the pipe.',
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ticketId: TICKET_ID,
      status: 'Assigned',
      assigneeId: STAFF_ID,
    });
    expect(store.saveAssignmentIfReported).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: TICKET_ID,
        staffId: STAFF_ID,
        instructions: 'Check the pipe.',
      }),
    );
    expect(context.audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: mockSignedIn.id, action: 'ticket.assign' }),
    );
    expect(context.notices.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: STAFF_ID }),
    );
  });

  it('rejects invalid assignment input before querying the store', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await assignTicket(
      request('POST', { staffId: STAFF_ID, priority: 'Critical', dueDate: '2099-12-01' }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(store.findTicketForAssignment).not.toHaveBeenCalled();
  });

  it('refuses an inactive maintenance worker and invalid staff IDs', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.isActiveMaintenanceStaff.mockResolvedValueOnce(false);

    const inactive = await assignTicket(
      request('POST', {
        staffId: STAFF_ID,
        priority: 'Normal',
        dueDate: '2099-12-01',
      }),
      routeContext(),
    );
    expect(inactive.status).toBe(400);
    expect(store.saveAssignmentIfReported).not.toHaveBeenCalled();

    const invalidId = await assignTicket(
      request('POST', {
        staffId: 'not-a-uuid',
        priority: 'Normal',
        dueDate: '2099-12-01',
      }),
      routeContext(),
    );
    expect(invalidId.status).toBe(400);
    expect(store.findTicketForAssignment).toHaveBeenCalledTimes(1);
  });

  it('atomically records a duplicate decision through the service dependency', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const response = await decideTicket(
      request('POST', {
        decision: 'Duplicate',
        originalTicketId: ORIGINAL_ID,
        reason: 'Same leak already reported.',
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ticketId: TICKET_ID,
      status: 'Duplicate',
      duplicateOfId: ORIGINAL_ID,
    });
    expect(store.saveReportedDecisionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: TICKET_ID,
        status: 'Duplicate',
        duplicateOfId: ORIGINAL_ID,
      }),
    );
  });

  it('supports Won’t fix and requires a reason', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const success = await decideTicket(
      request('POST', { decision: "Won't fix", reason: 'Not repairable.' }),
      routeContext(),
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ status: "Won't fix" });

    const invalid = await decideTicket(
      request('POST', { decision: "Won't fix", reason: '   ' }),
      routeContext(),
    );
    expect(invalid.status).toBe(400);
    expect(store.saveReportedDecisionIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported decisions and duplicate references outside the building', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });

    const unsupported = await decideTicket(
      request('POST', { decision: 'Cancel', reason: 'Reviewed' }),
      routeContext(),
    );
    expect(unsupported.status).toBe(400);
    expect(mockDatabaseManagerTicketContext).not.toHaveBeenCalled();

    store.findTicket.mockImplementation(async (id: string) =>
      id === TICKET_ID
        ? { id, status: 'Reported', title: 'Water leak', assigneeId: null }
        : undefined,
    );
    const outsideBuilding = await decideTicket(
      request('POST', {
        decision: 'Duplicate',
        originalTicketId: ORIGINAL_ID,
        reason: 'Same leak.',
      }),
      routeContext(),
    );
    expect(outsideBuilding.status).toBe(404);
    expect(store.saveReportedDecisionIfUnchanged).not.toHaveBeenCalled();
  });

  it('closes Fixed tickets, and refuses other states', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Fixed',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    });

    const closed = await closeTicket(request('POST'), routeContext());
    expect(closed.status).toBe(200);
    await expect(closed.json()).resolves.toEqual({ ticketId: TICKET_ID, status: 'Closed' });

    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Reported',
      title: 'Water leak',
      assigneeId: null,
    });
    const invalid = await closeTicket(request('POST'), routeContext());
    expect(invalid.status).toBe(409);
    expect(store.saveStatusChangeIfFixed).toHaveBeenCalledTimes(1);
  });

  it('reopens Fixed tickets with a reason and refuses Closed tickets', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Fixed',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    });

    const reopened = await reopenTicket(
      request('POST', { reason: 'The pipe is leaking again.' }),
      routeContext(),
    );
    expect(reopened.status).toBe(200);
    await expect(reopened.json()).resolves.toMatchObject({
      ticketId: TICKET_ID,
      status: 'Assigned',
      reason: 'The pipe is leaking again.',
    });

    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Closed',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    });
    const closed = await reopenTicket(
      request('POST', { reason: 'Try reopening.' }),
      routeContext(),
    );
    expect(closed.status).toBe(409);
  });

  it('requires a non-empty reason when reopening a Fixed ticket', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Fixed',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    });

    const response = await reopenTicket(request('POST', { reason: '  ' }), routeContext());

    expect(response.status).toBe(400);
    expect(store.saveStatusChangeIfFixed).not.toHaveBeenCalled();
  });

  it('does not report a transaction failure as a successful close', async () => {
    mockSignedIn = makeProfile({ role: 'manager', occupancyId: null });
    store.findTicket.mockResolvedValueOnce({
      id: TICKET_ID,
      status: 'Fixed',
      title: 'Water leak',
      assigneeId: STAFF_ID,
    });
    store.saveStatusChangeIfFixed.mockRejectedValueOnce(new Error('Database transaction failed'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await closeTicket(request('POST'), routeContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(context.audit).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  for (const [name, call] of protectedRoutes) {
    it(`requires manageTickets for the ${name} route when signed out`, async () => {
      const response = await call();

      expect(response.status).toBe(401);
      expect(mockDatabaseManagerTicketContext).not.toHaveBeenCalled();
    });

    it.each(['resident', 'guard', 'committee', 'maintenance', 'admin'] as const)(
      `denies a %s access to the ${name} route`,
      async (role) => {
        mockSignedIn = makeProfile({ role });

        const response = await call();

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE },
        });
        expect(mockDatabaseManagerTicketContext).not.toHaveBeenCalled();
      },
    );
  }

  it('denies a manager whose password change is still required', async () => {
    mockSignedIn = makeProfile({ role: 'manager', mustChangePassword: true });

    const response = await listTickets(request('GET'));

    expect(response.status).toBe(403);
    expect(mockDatabaseManagerTicketContext).not.toHaveBeenCalled();
  });
});
