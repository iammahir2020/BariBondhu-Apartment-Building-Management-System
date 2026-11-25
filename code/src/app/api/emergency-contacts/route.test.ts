/**
 * Role-check tests for `/api/emergency-contacts`: the role check runs first, every role in the table gets the
 * numbers, and a refused or signed-out request reads nothing (SG-06, BM-10, NFR-06).
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { databaseEmergencyContactStore } from '@/lib/adapters/emergencyContactAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { EmergencyContactStore } from '@/services/emergencyContactService';
import { makeProfile } from '@/services/testFakes';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/emergencyContactAdapters', () => ({
  databaseEmergencyContactStore: jest.fn(),
}));

function setUp(): EmergencyContactStore {
  const store: EmergencyContactStore = {
    list: jest.fn(async () => [{ id: 'g', label: 'Guard desk', phone: '01700000111', order: 1 }]),
  };
  jest.mocked(databaseEmergencyContactStore).mockReturnValue(store);
  return store;
}

const request = () => new Request('http://localhost/api/emergency-contacts');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for emergency numbers (NFR-06)', () => {
  it('every role but the administrator may see them', () => {
    expect(rolesFor('viewEmergencyNumbers')).toEqual([
      'resident',
      'guard',
      'manager',
      'committee',
      'maintenance',
    ]);
  });
});

describe('GET /api/emergency-contacts', () => {
  it('checks viewEmergencyNumbers first and returns the numbers', async () => {
    setUp();
    jest
      .mocked(requireRole)
      .mockResolvedValue({ actor: makeProfile({ id: 'guard-1', role: 'guard' }), scope: 'all' });
    const response = await GET(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewEmergencyNumbers');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      numbers: [{ label: 'Guard desk', phone: '01700000111' }],
    });
  });

  it('answers 403 and reads nothing for the administrator', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
  });

  it('answers 401 and reads nothing when signed out', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('UNAUTHORIZED', 'Log in to continue.'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });
});
