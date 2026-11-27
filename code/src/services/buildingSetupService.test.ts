/**
 * Tests for the administrator's view of the building setup (ADM-01): blocks with floors and flats, totals, and the
 * manager accounts.
 *
 * @author Mahir Al Kamal
 */
import { getBuildingSetup, type BuildingSetupStore } from './buildingSetupService';

function store(overrides: Partial<BuildingSetupStore> = {}): BuildingSetupStore {
  return {
    building: jest.fn(async () => ({ name: 'Lakeview Residence', address: 'Dhanmondi, Dhaka' })),
    blocks: jest.fn(async () => [
      { id: 'b', name: 'Block B' },
      { id: 'a', name: 'Block A' },
    ]),
    flats: jest.fn(async () => [
      { blockId: 'a', floor: 1 },
      { blockId: 'a', floor: 1 },
      { blockId: 'a', floor: 6 },
      { blockId: 'b', floor: 2 },
    ]),
    managers: jest.fn(async () => [
      { username: 'old-manager', displayName: 'Old', active: false, mustChangePassword: false },
      { username: 'bb-manager', displayName: 'Nasir', active: true, mustChangePassword: false },
    ]),
    ...overrides,
  };
}

describe('getBuildingSetup', () => {
  it('counts each block’s floors and flats, in name order (normal)', async () => {
    const setup = await getBuildingSetup(store());
    expect(setup.building).toEqual({ name: 'Lakeview Residence', address: 'Dhanmondi, Dhaka' });
    expect(setup.blocks).toEqual([
      { name: 'Block A', floors: 6, flats: 3 },
      { name: 'Block B', floors: 2, flats: 1 },
    ]);
    expect(setup.totalFlats).toBe(4);
  });

  it('puts the active manager first, keeping a replaced one (ADM-01)', async () => {
    const setup = await getBuildingSetup(store());
    expect(setup.managers.map((m) => m.username)).toEqual(['bb-manager', 'old-manager']);
  });

  it('shows a block with no flats yet as 0 floors and 0 flats (boundary)', async () => {
    const setup = await getBuildingSetup(
      store({ flats: jest.fn(async () => [{ blockId: 'a', floor: 1 }]) }),
    );
    expect(setup.blocks[1]).toEqual({ name: 'Block B', floors: 0, flats: 0 });
  });

  it('has no building and nothing else before setup (boundary)', async () => {
    const setup = await getBuildingSetup(
      store({
        building: jest.fn(async () => undefined),
        blocks: jest.fn(async () => []),
        flats: jest.fn(async () => []),
        managers: jest.fn(async () => []),
      }),
    );
    expect(setup).toEqual({ building: null, blocks: [], totalFlats: 0, managers: [] });
  });

  it('passes on a store failure (exception)', async () => {
    const failing = store({
      flats: jest.fn(async () => {
        throw new Error('database down');
      }),
    });
    await expect(getBuildingSetup(failing)).rejects.toThrow('database down');
  });
});
