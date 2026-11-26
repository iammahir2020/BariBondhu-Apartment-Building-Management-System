/**
 * Role checks for maintenance assigned-ticket routes (MNT-01 to MNT-04, NFR-06).
 * Other roles receive 403 and signed-out requests receive 401.
 *
 * @author Adika Rahman
 */
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Profile } from '@/models';
import { GET as listAssigned } from '@/app/api/maintenance/tickets/route';
import {
  GET as getAssigned,
  PATCH as updateAssigned,
} from '@/app/api/maintenance/tickets/[id]/route';
import { POST as addNote } from '@/app/api/maintenance/tickets/[id]/notes/route';
import { makeProfile } from '@/services/testFakes';

/** A valid ticket UUID used by the route tests. */
const ticketId = '0b6f6c1a-2d3e-4f50-8a1b-2c3d4e5f6a7b';

/** The signed-in profile for the current test. */
let mockSignedIn: Profile | null = null;

jest.mock('@/lib/auth', () => {
  const { checkRole } = jest.requireActual('@/lib/permissions');
  const { AppError } = jest.requireActual('@/lib/errors');

  return {
    requireRole: async (_request: Request, action: string) => {
      if (!mockSignedIn) {
        throw new AppError('UNAUTHORIZED', 'Log in first.');
      }

      return checkRole(mockSignedIn, action);
    },
  };
});

jest.mock('@/lib/db', () => ({ db: {} }));

jest.mock('@/lib/adapters/assignedTicketAdapters', () => ({
  databaseAssignedTicketStore: () => ({
    assigneeIdFor: async () => 'maintenance-1',
    listForAssignee: async () => [],
    findForAssignee: async () => null,
    updateStatusForAssignee: async () => undefined,
  }),
}));

jest.mock('@/lib/adapters/workNoteAdapters', () => ({
  databaseWorkNoteStore: () => ({
    createForAssignee: async () => undefined,
  }),
}));

/** A route parameter object in the format expected by Next.js. */
const params = {
  params: Promise.resolve({ id: ticketId }),
};

/** Every maintenance route, called as an HTTP request. */
const ROUTES: readonly [string, () => Promise<Response>][] = [
  [
    'GET /api/maintenance/tickets',
    () => listAssigned(new Request('http://app/api/maintenance/tickets')),
  ],
  [
    'GET /api/maintenance/tickets/[id]',
    () => getAssigned(new Request(`http://app/api/maintenance/tickets/${ticketId}`), params),
  ],
  [
    'PATCH /api/maintenance/tickets/[id]',
    () =>
      updateAssigned(
        new Request(`http://app/api/maintenance/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'In progress' }),
        }),
        params,
      ),
  ],
  [
    'POST /api/maintenance/tickets/[id]/notes',
    () =>
      addNote(
        new Request(`http://app/api/maintenance/tickets/${ticketId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Checked the reported issue.' }),
        }),
        params,
      ),
  ],
];

/** A maintenance worker who is allowed to work on assigned tickets. */
const maintenanceWorker = makeProfile({
  id: 'maintenance-1',
  role: 'maintenance',
  occupancyId: null,
});

describe.each(ROUTES)('%s', (_, call) => {
  beforeEach(() => {
    mockSignedIn = null;
  });

  it.each(['resident', 'guard', 'manager', 'committee', 'admin'] as const)(
    'returns 403 to a %s',
    async (role) => {
      mockSignedIn = makeProfile({ role, occupancyId: null });

      const response = await call();

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: 'FORBIDDEN',
          message: FORBIDDEN_MESSAGE,
        },
      });
    },
  );

  it('returns 401 when signed out', async () => {
    mockSignedIn = null;

    const response = await call();

    expect(response.status).toBe(401);
  });

  it('allows a maintenance worker past the role check', async () => {
    mockSignedIn = maintenanceWorker;

    const response = await call();

    const body = (await response.json()) as {
      error?: { message: string };
    };

    expect(response.status).not.toBe(401);
    expect(body.error?.message).not.toBe(FORBIDDEN_MESSAGE);
  });
});
