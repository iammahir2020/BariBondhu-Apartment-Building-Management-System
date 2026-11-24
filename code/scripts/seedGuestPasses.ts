/**
 * Demo data for guest passes (features 16 to 18): one pass in each of the six states for the two demo resident
 * households, with fixed codes so a guard demo can type them. `seed.ts` calls {@link seedGuestPasses} after the demo
 * accounts exist.
 *
 * The times are counted from the moment the seed runs, and every run puts each sample pass back to its demo state
 * (found by its code). So run `npm run db:seed` on the morning of a demo, and the Active pass is active, the Expired
 * one has expired, and so on.
 *
 * Partly used and Fully used only set the guests used for now. Once the Visit table (feature 17) exists, matching
 * visits belong next to them.
 *
 * @author Mahir Al Kamal
 */
import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../src/models';

const { guestPasses, profiles } = schema;

/** One sample pass. Times are in hours from the moment the seed runs. */
interface SamplePass {
  /** The state the pass is in when the seed has just run. */
  state: string;
  code: string;
  username: 'bb-resident1' | 'bb-resident2';
  guestName: string;
  guestCount: number;
  startsInHours: number;
  endsInHours: number;
  guestsUsed: number;
  cancelledHoursAgo?: number;
}

/** One pass per state from the guest pass state diagram. */
const SAMPLE_PASSES: readonly SamplePass[] = [
  {
    state: 'Scheduled',
    code: '204816',
    username: 'bb-resident1',
    guestName: 'Tanvir Ahmed',
    guestCount: 3,
    startsInHours: 20,
    endsInHours: 24,
    guestsUsed: 0,
  },
  {
    state: 'Active',
    code: '381502',
    username: 'bb-resident1',
    guestName: 'Farhana Islam',
    guestCount: 2,
    startsInHours: -1,
    endsInHours: 3,
    guestsUsed: 0,
  },
  {
    state: 'Partly used',
    code: '472930',
    username: 'bb-resident2',
    guestName: 'Rafiq Uddin and family',
    guestCount: 4,
    startsInHours: -2,
    endsInHours: 4,
    guestsUsed: 2,
  },
  {
    state: 'Fully used',
    code: '519274',
    username: 'bb-resident1',
    guestName: 'Sumaiya Khan',
    guestCount: 1,
    startsInHours: -3,
    endsInHours: 2,
    guestsUsed: 1,
  },
  {
    state: 'Cancelled',
    code: '630418',
    username: 'bb-resident2',
    guestName: 'Imran Hossain',
    guestCount: 2,
    startsInHours: 2,
    endsInHours: 6,
    guestsUsed: 0,
    cancelledHoursAgo: 1,
  },
  {
    state: 'Expired',
    code: '745163',
    username: 'bb-resident2',
    guestName: 'Nadia Rahman',
    guestCount: 3,
    startsInHours: -28,
    endsInHours: -22,
    guestsUsed: 1,
  },
];

const HOUR = 60 * 60 * 1000;

/**
 * Adds the sample guest passes, or puts existing ones back to their demo state with fresh times.
 * @param db - The seed's Drizzle client.
 * @returns How many sample passes there are.
 * @throws Error if a demo resident account or its household is missing.
 */
export async function seedGuestPasses(db: PostgresJsDatabase<typeof schema>): Promise<number> {
  const residents = await db
    .select({ id: profiles.id, username: profiles.username, occupancyId: profiles.occupancyId })
    .from(profiles)
    .where(inArray(profiles.username, ['bb-resident1', 'bb-resident2']));

  const now = Date.now();
  for (const sample of SAMPLE_PASSES) {
    const resident = residents.find((r) => r.username === sample.username);
    if (!resident?.occupancyId) {
      throw new Error(`Demo account ${sample.username} or its household is missing.`);
    }
    const values = {
      occupancyId: resident.occupancyId,
      createdById: resident.id,
      guestName: sample.guestName,
      guestCount: sample.guestCount,
      startsAt: new Date(now + sample.startsInHours * HOUR),
      endsAt: new Date(now + sample.endsInHours * HOUR),
      code: sample.code,
      guestsUsed: sample.guestsUsed,
      cancelledAt:
        sample.cancelledHoursAgo === undefined
          ? null
          : new Date(now - sample.cancelledHoursAgo * HOUR),
      createdAt: new Date(now + Math.min(sample.startsInHours, 0) * HOUR - 2 * HOUR),
    };
    const [existing] = await db
      .select({ id: guestPasses.id })
      .from(guestPasses)
      .where(eq(guestPasses.code, sample.code));
    if (existing) {
      await db.update(guestPasses).set(values).where(eq(guestPasses.id, existing.id));
    } else {
      await db.insert(guestPasses).values(values);
    }
  }
  return SAMPLE_PASSES.length;
}
