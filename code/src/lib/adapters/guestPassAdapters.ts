/**
 * Database adapters for `guestPassService.ts`: a household's guest passes and the occupancy they belong to.
 * Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { guestPasses, occupancies } from '@/models';
import { databaseAuditWriter } from '@/services/auditService';
import type { GuestPassDeps, GuestPassStore } from '@/services/guestPassService';

/**
 * Everything the guest pass service needs, wired to the database.
 * @param db - Database to use.
 * @returns The pass store and audit writer.
 */
export function guestPassDeps(db: Database): GuestPassDeps {
  return { passes: databaseGuestPassStore(db), audit: databaseAuditWriter(db) };
}

/**
 * A {@link GuestPassStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseGuestPassStore(db: Database): GuestPassStore {
  return {
    async activeFlatOf(occupancyId) {
      const [row] = await db
        .select({ flatId: occupancies.flatId })
        .from(occupancies)
        .where(and(eq(occupancies.id, occupancyId), isNull(occupancies.endDate)));
      return row?.flatId ?? null;
    },

    async passesWithCode(code) {
      return db.select().from(guestPasses).where(eq(guestPasses.code, code));
    },

    async insert(pass) {
      await db.insert(guestPasses).values(pass);
    },

    async findById(id) {
      const [row] = await db.select().from(guestPasses).where(eq(guestPasses.id, id));
      return row ?? null;
    },

    async listForOccupancy(occupancyId) {
      return db.select().from(guestPasses).where(eq(guestPasses.occupancyId, occupancyId));
    },

    async cancelIfLive(id, at) {
      // The same test as guestPassStatusAt: not cancelled, not fully used, and before its end time.
      const updated = await db
        .update(guestPasses)
        .set({ cancelledAt: at })
        .where(
          and(
            eq(guestPasses.id, id),
            isNull(guestPasses.cancelledAt),
            lt(guestPasses.guestsUsed, guestPasses.guestCount),
            gt(guestPasses.endsAt, at),
          ),
        )
        .returning({ id: guestPasses.id });
      return updated.length > 0;
    },
  };
}
