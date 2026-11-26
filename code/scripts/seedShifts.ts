/**
 * Seeds the next seven days of guard shifts, including one four-hour coverage gap.
 *
 * @author Tawhid Bin Moslim
 */
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../src/models';

const { profiles, shifts } = schema;

const HOUR = 60 * 60 * 1000;

const GUARD_USERNAMES = {
  hanif: 'bb-guard-hanif',
  selim: 'bb-guard',
  babul: 'bb-guard-babul',
} as const;

type GuardKey = keyof typeof GUARD_USERNAMES;

/**
 * Morning, evening, and night guard assignments for each of the seven days.
 * The third day's night shift ends at 2 AM, leaving the only coverage gap.
 */
const ROSTER = [
  ['hanif', 'selim', 'babul'],
  ['babul', 'hanif', 'selim'],
  ['babul', 'hanif', 'selim'],
  ['hanif', 'selim', 'babul'],
  ['babul', 'hanif', 'selim'],
  ['hanif', 'selim', 'babul'],
  ['babul', 'hanif', 'selim'],
] as const;

/** Adds a number of hours to a date. */
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR);
}

/**
 * Returns 6 AM Bangladesh time on the current calendar day.
 * UTC midnight corresponds to 6 AM in Asia/Dhaka.
 */
function getBangladeshDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((item) => item.type === type)?.value;
    if (!value) throw new Error(`Could not determine Bangladesh date part: ${type}`);
    return Number(value);
  };

  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

/**
 * Creates the seven-day demo guard roster.
 *
 * Existing active shifts that overlap a planned slot are preserved.
 * Removed shifts are never restored.
 *
 * @param db - The seed script's database client.
 * @returns The number of new shifts inserted.
 */
export async function seedShifts(db: PostgresJsDatabase<typeof schema>): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const windowStart = getBangladeshDayStart(now);
    const windowEnd = addHours(windowStart, 7 * 24);

    const usernames = Object.values(GUARD_USERNAMES);

    const guardRows = await tx
      .select({
        id: profiles.id,
        username: profiles.username,
        role: profiles.role,
        active: profiles.active,
      })
      .from(profiles)
      .where(inArray(profiles.username, usernames));

    const guardIds = {} as Record<GuardKey, string>;

    for (const key of Object.keys(GUARD_USERNAMES) as GuardKey[]) {
      const username = GUARD_USERNAMES[key];
      const guard = guardRows.find((row) => row.username === username);

      if (!guard || guard.role !== 'guard' || !guard.active) {
        throw new Error(`Active demo guard account "${username}" is missing.`);
      }

      guardIds[key] = guard.id;
    }

    const plans = ROSTER.flatMap((assignment, day) => {
      const dayStart = addHours(windowStart, day * 24);
      const [morningGuard, eveningGuard, nightGuard] = assignment;

      const nightEnd = addHours(dayStart, day === 2 ? 20 : 24);

      return [
        {
          guardId: guardIds[morningGuard],
          startsAt: dayStart,
          endsAt: addHours(dayStart, 8),
        },
        {
          guardId: guardIds[eveningGuard],
          startsAt: addHours(dayStart, 8),
          endsAt: addHours(dayStart, 16),
        },
        {
          guardId: guardIds[nightGuard],
          startsAt: addHours(dayStart, 16),
          endsAt: nightEnd,
        },
      ];
    });

    // Include the previous 24 hours to detect shifts crossing into the first day.
    const lookupStart = addHours(windowStart, -24);

    const existingShifts = await tx
      .select({
        id: shifts.id,
        guardId: shifts.guardId,
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
        status: shifts.status,
      })
      .from(shifts)
      .where(
        and(
          inArray(shifts.guardId, Object.values(guardIds)),
          gte(shifts.startsAt, lookupStart),
          lt(shifts.startsAt, windowEnd),
        ),
      );

    let added = 0;

    for (const plan of plans) {
      const exact = existingShifts.find(
        (item) =>
          item.guardId === plan.guardId && item.startsAt.getTime() === plan.startsAt.getTime(),
      );

      if (exact?.status === 'Removed') {
        // Do not restore a shift that was intentionally removed.
        continue;
      }

      if (exact && exact.endsAt.getTime() === plan.endsAt.getTime()) {
        const status =
          exact.endsAt <= now ? 'Finished' : exact.startsAt <= now ? 'On duty' : 'Planned';

        if (exact.status !== status) {
          await tx.update(shifts).set({ status }).where(eq(shifts.id, exact.id));
          exact.status = status;
        }

        continue;
      }

      // A slot is already covered if any demo guard has an active overlapping shift.
      // This also prevents two different guards from being assigned to the same slot.
      const overlap = existingShifts.find(
        (item) =>
          item.status !== 'Removed' && item.startsAt < plan.endsAt && item.endsAt > plan.startsAt,
      );

      if (overlap) {
        continue;
      }

      const status = plan.endsAt <= now ? 'Finished' : plan.startsAt <= now ? 'On duty' : 'Planned';

      const [created] = await tx
        .insert(shifts)
        .values({ ...plan, status })
        .returning({
          id: shifts.id,
          guardId: shifts.guardId,
          startsAt: shifts.startsAt,
          endsAt: shifts.endsAt,
          status: shifts.status,
        });

      if (!created) throw new Error('Could not create a demo guard shift.');

      existingShifts.push(created);
      added += 1;
    }

    return added;
  });
}
