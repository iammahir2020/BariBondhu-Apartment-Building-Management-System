/**
 * Tests for `/api/emergency-contacts`: viewing and manager-only editing.
 *
 * @jest-environment node
 * @author Adika Rahman
 */
import { databaseEmergencyContactStore } from '@/lib/adapters/emergencyContactAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { EmergencyContactStore } from '@/services/emergencyContactService';
import { makeProfile } from '@/services/testFakes';
import { GET, PATCH } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/emergencyContactAdapters', () => ({
  databaseEmergencyContactStore: jest.fn(),
}));

function setUp(): EmergencyContactStore {
  const store: EmergencyContactStore = {
    list: jest.fn(async () => [{ id: 'g', label: 'Guard desk', phone: '01700000111', order: 1 }]),
    updateByLabel: jest.fn(async (label, phone) => ({
      id: 'g',
      label,
      phone,
      order: 1,
    })),
  };
  jest.mocked(databaseEmergencyContactStore).mockReturnValue(store);
  return store;
}

const request = () => new Request('http://localhost/api/emergency-contacts');

const patchRequest = (body: unknown) =>
  new Request('http://localhost/api/emergency-contacts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for emergency numbers', () => {
  it('allows the expected roles to view numbers', () => {
    expect(rolesFor('viewEmergencyNumbers')).toEqual([
      'resident',
      'guard',
      'manager',
      'committee',
      'maintenance',
    ]);
  });

  it('allows only the manager to edit numbers', () => {
    expect(rolesFor('editEmergencyNumbers')).toEqual(['manager']);
  });
});

describe('GET /api/emergency-contacts', () => {
  it('checks permission and returns the numbers', async () => {
    setUp();
    jest.mocked(requireRole).mockResolvedValue({
      actor: makeProfile({ id: 'guard-1', role: 'guard' }),
      scope: 'all',
    });

    const response = await GET(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewEmergencyNumbers');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      numbers: [{ label: 'Guard desk', phone: '01700000111' }],
    });
  });

  it('answers 403 when viewing is refused', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/emergency-contacts', () => {
  it('checks manager permission and updates the number', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockResolvedValue({
      actor: makeProfile({ id: 'manager-1', role: 'manager' }),
      scope: 'all',
    });

    const response = await PATCH(patchRequest({ label: 'Guard desk', phone: '01800000111' }));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'editEmergencyNumbers');
    expect(store.updateByLabel).toHaveBeenCalledWith('Guard desk', '01800000111');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      number: { label: 'Guard desk', phone: '01800000111' },
    });
  });

  it('answers 403 and does not update for a refused role', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));

    const response = await PATCH(patchRequest({ label: 'Guard desk', phone: '01800000111' }));

    expect(response.status).toBe(403);
    expect(store.updateByLabel).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockResolvedValue({
      actor: makeProfile({ id: 'manager-1', role: 'manager' }),
      scope: 'all',
    });

    const response = await PATCH(patchRequest({ label: 'Guard desk', phone: '999' }));

    expect(response.status).toBe(400);
    expect(store.updateByLabel).not.toHaveBeenCalled();
  });
});
