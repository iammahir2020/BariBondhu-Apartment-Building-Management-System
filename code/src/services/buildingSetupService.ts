/**
 * What the system administrator sees on their home (ADM-01, prototype `A-Setup.html`, read-only version, BB-0012):
 * the building, its blocks with their floors and flats, and the manager account. Setting these up stays seeded in
 * Release 1 (feature 2), so this only reads.
 *
 * @author Mahir Al Kamal
 */
import type { Building, Profile } from '@/models';

/** The manager account fields the administrator sees. */
export type ManagerAccount = Pick<
  Profile,
  'username' | 'displayName' | 'active' | 'mustChangePassword'
>;

/** Reads the building setup. */
export interface BuildingSetupStore {
  /** The building, or undefined before setup. Release 1 has one building per installation. */
  building(): Promise<Pick<Building, 'name' | 'address'> | undefined>;
  /** Every block, with its id and name. */
  blocks(): Promise<{ id: string; name: string }[]>;
  /** Every flat's block and floor. */
  flats(): Promise<{ blockId: string; floor: number }[]>;
  /** Every manager account, active or not. */
  managers(): Promise<ManagerAccount[]>;
}

/** One block as the administrator sees it. */
export interface BlockSetup {
  name: string;
  /** The highest floor with a flat (0 when the block has no flats yet). */
  floors: number;
  /** How many flats the block has. */
  flats: number;
}

/** The whole setup. */
export interface BuildingSetup {
  building: Pick<Building, 'name' | 'address'> | null;
  /** Blocks in name order. */
  blocks: BlockSetup[];
  /** Flats in every block. */
  totalFlats: number;
  /** Manager accounts, the active one first. */
  managers: ManagerAccount[];
}

/**
 * Builds the setup from the store: each block's floors and flat count, and the managers with the active one first.
 * @param store - Where the building, blocks, flats and managers come from.
 * @returns The building setup.
 */
export async function getBuildingSetup(store: BuildingSetupStore): Promise<BuildingSetup> {
  const [building, blocks, flats, managers] = await Promise.all([
    store.building(),
    store.blocks(),
    store.flats(),
    store.managers(),
  ]);
  const blockSetups = blocks
    .map((block) => {
      const own = flats.filter((flat) => flat.blockId === block.id);
      return {
        name: block.name,
        floors: own.reduce((highest, flat) => Math.max(highest, flat.floor), 0),
        flats: own.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    building: building ?? null,
    blocks: blockSetups,
    totalFlats: flats.length,
    managers: [...managers].sort((a, b) => Number(b.active) - Number(a.active)),
  };
}
