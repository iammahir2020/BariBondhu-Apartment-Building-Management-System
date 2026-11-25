/**
 * Role-check tests for `/api/buildings`: only the administrator gets the setup, the role check runs first, and a
 * refused or signed-out request reads nothing (ADM-01, NFR-06).
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { databaseBuildingSetupStore } from '@/lib/adapters/buildingSetupAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { BuildingSetupStore } from '@/services/buildingSetupService';
import { makeProfile } from '@/services/testFakes';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/buildingSetupAdapters', () => ({
  databaseBuildingSetupStore: jest.fn(),
}));

function setUp(): BuildingSetupStore {
  const store: BuildingSetupStore = {
    building: jest.fn(async () => ({ name: 'Lakeview Residence', address: 'Dhanmondi' })),
    blocks: jest.fn(async () => [{ id: 'a', name: 'Block A' }]),
    flats: jest.fn(async () => [{ blockId: 'a', floor: 1 }]),
    managers: jest.fn(async () => []),
  };
  jest.mocked(databaseBuildingSetupStore).mockReturnValue(store);
  return store;
}

const request = () => new Request('http://localhost/api/buildings');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for the building setup (NFR-06)', () => {
  it('only the administrator may see it', () => {
    expect(rolesFor('setUpBuilding')).toEqual(['admin']);
  });
});

describe('GET /api/buildings', () => {
  it('checks setUpBuilding first and returns the setup', async () => {
    setUp();
    jest
      .mocked(requireRole)
      .mockResolvedValue({ actor: makeProfile({ id: 'admin-1', role: 'admin' }), scope: 'all' });
    const response = await GET(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'setUpBuilding');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { totalFlats: number; building: { name: string } };
    expect(body.totalFlats).toBe(1);
    expect(body.building.name).toBe('Lakeview Residence');
  });

  it('answers 403 and reads nothing for any other role', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(store.building).not.toHaveBeenCalled();
  });

  it('answers 401 and reads nothing when signed out', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('UNAUTHORIZED', 'Log in to continue.'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(store.managers).not.toHaveBeenCalled();
  });
});
