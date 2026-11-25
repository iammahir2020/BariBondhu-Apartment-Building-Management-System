/**
 * Database adapter for `buildingSetupService.ts`: reads the building, blocks, flats and manager accounts. Connection
 * code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { blocks, buildings, flats, profiles } from '@/models';
import type { BuildingSetupStore } from '@/services/buildingSetupService';

/**
 * A {@link BuildingSetupStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseBuildingSetupStore(db: Database): BuildingSetupStore {
  return {
    async building() {
      const rows = await db
        .select({ name: buildings.name, address: buildings.address })
        .from(buildings)
        .limit(1);
      return rows[0];
    },
    async blocks() {
      return db.select({ id: blocks.id, name: blocks.name }).from(blocks);
    },
    async flats() {
      return db.select({ blockId: flats.blockId, floor: flats.floor }).from(flats);
    },
    async managers() {
      return db
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          active: profiles.active,
          mustChangePassword: profiles.mustChangePassword,
        })
        .from(profiles)
        .where(eq(profiles.role, 'manager'));
    },
  };
}
