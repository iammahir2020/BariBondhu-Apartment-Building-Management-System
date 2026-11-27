/**
 * Database adapter for guard-side guest pass checking and entry recording.
 * BB-1705, SG-02, SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import 'server-only';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { blocks, flats, guestPasses, occupancies, visits } from '@/models';
import type { GuestPassCheckRecord, GuestPassCheckStore } from '@/services/guestPassCheckService';
import type {
  GuestPassEntryRecord,
  GuestPassEntryStore,
  RecordEntryCommand,
} from '@/services/guestPassEntryService';

/**
 * A database-backed store for checking guest passes and recording entries.
 *
 * @param db - Database connection.
 * @returns The checking and entry-recording store.
 */
export function databaseGuestPassGateStore(
  db: Database,
): GuestPassCheckStore & GuestPassEntryStore {
  return {
    async passesWithCode(code): Promise<GuestPassCheckRecord[]> {
      return db
        .select({
          guestName: guestPasses.guestName,
          blockName: blocks.name,
          flatNumber: flats.number,
          startsAt: guestPasses.startsAt,
          endsAt: guestPasses.endsAt,
          guestCount: guestPasses.guestCount,
          guestsUsed: guestPasses.guestsUsed,
          cancelledAt: guestPasses.cancelledAt,
          createdAt: guestPasses.createdAt,
        })
        .from(guestPasses)
        .innerJoin(occupancies, eq(guestPasses.occupancyId, occupancies.id))
        .innerJoin(flats, eq(occupancies.flatId, flats.id))
        .innerJoin(blocks, eq(flats.blockId, blocks.id))
        .where(eq(guestPasses.code, code));
    },

    async findById(passId): Promise<GuestPassEntryRecord | null> {
      const [pass] = await db
        .select({
          id: guestPasses.id,
          createdById: guestPasses.createdById,
          startsAt: guestPasses.startsAt,
          endsAt: guestPasses.endsAt,
          guestCount: guestPasses.guestCount,
          guestsUsed: guestPasses.guestsUsed,
          cancelledAt: guestPasses.cancelledAt,
        })
        .from(guestPasses)
        .where(eq(guestPasses.id, passId));

      return pass ?? null;
    },

    async recordEntry(command: RecordEntryCommand) {
      return db.transaction(async (tx) => {
        // Compare-and-set prevents two guards from using the same allowance.
        // The remaining conditions recheck validity at the actual entry time.
        const updated = await tx
          .update(guestPasses)
          .set({
            guestsUsed: sql`${guestPasses.guestsUsed} + ${command.guestsIn}`,
          })
          .where(
            and(
              eq(guestPasses.id, command.passId),
              eq(guestPasses.guestsUsed, command.expectedGuestsUsed),
              lte(guestPasses.startsAt, command.enteredAt),
              gt(guestPasses.endsAt, command.enteredAt),
              or(isNull(guestPasses.cancelledAt), gt(guestPasses.cancelledAt, command.enteredAt)),
              sql`${guestPasses.guestsUsed} + ${command.guestsIn} <= ${guestPasses.guestCount}`,
            ),
          )
          .returning({ id: guestPasses.id });

        if (updated.length === 0) {
          return null;
        }

        const [visit] = await tx
          .insert(visits)
          .values({
            guestPassId: command.passId,
            guestsIn: command.guestsIn,
            enteredAt: command.enteredAt,
            guardId: command.guardId,
            enteredLater: command.enteredLater,
          })
          .returning();

        return visit ?? null;
      });
    },
  };
}
