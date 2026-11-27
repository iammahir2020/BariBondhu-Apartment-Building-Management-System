/**
 * Database adapter for shiftService.ts and shiftDutyService.ts.
 * BM-09, SG-05.
 *
 * @author Tawhid Bin Moslim
 */

import { and, eq, gt, lt } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { profiles, shifts } from '@/models';
import type { ShiftDutyStore } from '@/services/shiftDutyService';
import type { ShiftStore } from '@/services/shiftService';

/**
 * Creates a database-backed store for planning shifts and viewing duty lists.
 *
 * @param db - Database connection.
 * @returns Shift storage operations for both shift services.
 */
export function databaseShiftStore(db: Database): ShiftStore & ShiftDutyStore {
  return {
    /**
     * Finds a guard profile by ID.
     */
    async findGuard(guardId) {
      const rows = await db
        .select({
          id: profiles.id,
          role: profiles.role,
          active: profiles.active,
        })
        .from(profiles)
        .where(eq(profiles.id, guardId))
        .limit(1);

      return rows[0] ?? null;
    },

    /**
     * Lists all shifts assigned to a guard for overlap validation.
     */
    async listForGuard(guardId) {
      return db
        .select({
          startsAt: shifts.startsAt,
          endsAt: shifts.endsAt,
          status: shifts.status,
        })
        .from(shifts)
        .where(eq(shifts.guardId, guardId));
    },

    /**
     * Creates a new planned shift.
     */
    async create(input) {
      const [created] = await db.insert(shifts).values(input).returning();

      if (!created) {
        throw new Error('Failed to create the guard shift.');
      }

      return created;
    },

    /**
     * Lists shifts overlapping the requested time window.
     */
    async listOverlapping(startsAt, endsAt) {
      return db
        .select()
        .from(shifts)
        .where(and(gt(shifts.endsAt, startsAt), lt(shifts.startsAt, endsAt)));
    },

    /**
     * Lists one guard's shifts overlapping the requested time window.
     */
    async listOverlappingForGuard(guardId, startsAt, endsAt) {
      return db
        .select()
        .from(shifts)
        .where(
          and(
            eq(shifts.guardId, guardId),
            gt(shifts.endsAt, startsAt),
            lt(shifts.startsAt, endsAt),
          ),
        );
    },
  };
}
