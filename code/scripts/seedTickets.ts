/**
 * Demo data for fault tickets (features 12 to 15): the common-area places from BR-13, and sample tickets in every
 * state of the ticket state diagram, some assigned to `bb-maintenance`, with their status history and followers.
 * `seed.ts` calls {@link seedTickets} after the demo accounts exist.
 *
 * Every sample ticket's history goes through {@link checkTicketTransition}, so the seed can only hold changes the
 * state machine allows, made by the role that may make them.
 *
 * Safe to run again: places are found by name, tickets by title. An existing sample ticket is put back to its demo
 * state (fields, status history and followers), so a demo always starts from the same place, even after someone
 * assigned, closed or followed a sample ticket while testing.
 *
 * @author Mahir Al Kamal
 */
import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Role } from '../src/lib/roles';
import * as schema from '../src/models';
import type { TicketCategory, TicketPriority, TicketStatus } from '../src/models';
import { TICKET_TRANSITIONS, checkTicketTransition } from '../src/services/ticketStateMachine';

const { commonAreaPlaces, profiles, ticketFollowers, ticketStatusChanges, tickets } = schema;

/** The Drizzle client the seed uses. */
export type SeedDatabase = PostgresJsDatabase<typeof schema>;

/** The common-area places listed in BR-13. The manager can add more later. */
export const COMMON_AREA_PLACES = [
  'Lift 1',
  'Lift 2',
  'Water pump',
  'Generator',
  'Roof',
  'Stairs',
  'Parking',
  'Lobby',
  'Other',
] as const;

/** A demo household with an account, named by its `block/flat` key in `seed.ts`. */
type Household = 'A/1A' | 'B/1B' | 'A/2B';

/** Demo resident account of each household that reports or follows sample tickets. */
const RESIDENT_OF: Record<Household, string> = {
  'A/1A': 'bb-resident1',
  'B/1B': 'bb-resident2',
  'A/2B': 'bb-firstlogin',
};

/** One sample ticket. Its status is the last entry of `path`. */
interface SampleTicket {
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  /** Where the fault is: inside the reporting household's flat, or at a common-area place. */
  where: { flat: true } | { place: (typeof COMMON_AREA_PLACES)[number] };
  description: string;
  homeTimes?: string;
  /** The reporting household, or `staff` for a problem found by `bb-maintenance` during a repair (MNT-05). */
  reporter: Household | 'staff';
  /** Every status from Reported to the current one, in order. */
  path: readonly TicketStatus[];
  /** Reasons for the changes that need one, keyed by the status changed to. Only saved where a reason is required. */
  reasons?: Partial<Record<TicketStatus, string>>;
  /** Other households that tapped "Me too" (BR-13). */
  alsoFollowedBy?: readonly Household[];
  /** For a Duplicate, the title of the original ticket. */
  duplicateOf?: string;
  /** For a found-by-staff ticket, the title of the ticket being worked on. */
  linkedTo?: string;
  instructions?: string;
  /** Due date in days from today, for tickets that were assigned. */
  dueInDays?: number;
  /** When it was reported, in days before now. */
  reportedDaysAgo: number;
}

/**
 * The sample tickets: each of the nine states at least once, inside flats and in common areas, one Urgent emergency,
 * one reopened ticket, one with "Me too" followers and one found by staff. Originals come before the tickets that
 * point to them.
 */
const SAMPLE_TICKETS: readonly SampleTicket[] = [
  {
    title: 'Kitchen sink is leaking',
    category: 'Plumbing',
    priority: 'Normal',
    where: { flat: true },
    description:
      'Water drips from the pipe under the kitchen sink and the cabinet floor stays wet.',
    homeTimes: 'Weekdays after 5 pm, all day Friday',
    reporter: 'A/1A',
    path: ['Reported'],
    reportedDaysAgo: 0,
  },
  {
    title: 'Lift 1 makes a grinding noise',
    category: 'Lift',
    priority: 'Normal',
    where: { place: 'Lift 1' },
    description: 'Lift 1 grinds and shakes between the 2nd and 3rd floor, going up and down.',
    reporter: 'B/1B',
    path: ['Reported'],
    alsoFollowedBy: ['A/1A', 'A/2B'],
    reportedDaysAgo: 1,
  },
  {
    title: 'Gas smell on the stairs',
    category: 'Fire or gas smell',
    priority: 'Urgent',
    where: { place: 'Stairs' },
    description: 'Strong gas smell on the stairs near the 3rd floor of Block A.',
    reporter: 'A/2B',
    path: ['Reported', 'Assigned'],
    instructions: 'Check the gas line on the 3rd floor landing first. Call me before you leave.',
    dueInDays: 0,
    reportedDaysAgo: 0,
  },
  {
    title: 'Water pump trips the breaker',
    category: 'Plumbing',
    priority: 'High',
    where: { place: 'Water pump' },
    description:
      'The pump stops every few minutes and the breaker trips, so the roof tank does not fill.',
    reporter: 'A/1A',
    path: ['Reported', 'Assigned', 'In progress'],
    instructions: 'Check the pump motor and the float switch.',
    dueInDays: 1,
    reportedDaysAgo: 2,
  },
  {
    title: 'Generator does not start',
    category: 'Electrical',
    priority: 'High',
    where: { place: 'Generator' },
    description: 'The generator did not start during the load-shedding last night.',
    reporter: 'B/1B',
    path: ['Reported', 'Assigned', 'In progress', 'On hold'],
    reasons: { 'On hold': 'Waiting for a new starter battery from the supplier.' },
    instructions: 'Test the battery and the starter motor.',
    dueInDays: 3,
    reportedDaysAgo: 4,
  },
  {
    title: 'Bedroom socket sparks',
    category: 'Electrical',
    priority: 'High',
    where: { flat: true },
    description: 'The socket next to the bed sparks when something is plugged in.',
    homeTimes: 'Every day after 6 pm',
    reporter: 'B/1B',
    path: ['Reported', 'Assigned', 'In progress', 'Fixed', 'Assigned', 'In progress'],
    reasons: { Assigned: 'The resident says it still sparks after the repair.' },
    instructions: 'Replace the socket and check the wiring behind it.',
    dueInDays: 1,
    reportedDaysAgo: 6,
  },
  {
    title: 'No water in the bathroom tap',
    category: 'Water supply',
    priority: 'Normal',
    where: { flat: true },
    description: 'The bathroom tap has no water; the kitchen tap works.',
    homeTimes: 'Saturday morning',
    reporter: 'A/2B',
    path: ['Reported', 'Assigned', 'In progress', 'Fixed'],
    instructions: 'Probably the valve behind the bathroom wall.',
    dueInDays: -1,
    reportedDaysAgo: 5,
  },
  {
    title: 'Lobby lights are off',
    category: 'Electrical',
    priority: 'Normal',
    where: { place: 'Lobby' },
    description: 'All the lights in the ground floor lobby are off at night.',
    reporter: 'A/1A',
    path: ['Reported', 'Assigned', 'In progress', 'Fixed', 'Closed'],
    instructions: 'Replace the tubes and check the timer.',
    dueInDays: -5,
    reportedDaysAgo: 9,
  },
  {
    title: 'Front door lock is stiff',
    category: 'Other',
    priority: 'Normal',
    where: { flat: true },
    description: 'The front door lock is hard to turn.',
    reporter: 'A/1A',
    path: ['Reported', 'Cancelled'],
    reportedDaysAgo: 7,
  },
  {
    title: 'Lift 1 is noisy',
    category: 'Lift',
    priority: 'Normal',
    where: { place: 'Lift 1' },
    description: 'Lift 1 is making a loud noise.',
    reporter: 'A/2B',
    path: ['Reported', 'Duplicate'],
    reasons: {
      Duplicate: 'Same fault as "Lift 1 makes a grinding noise". You now follow that ticket.',
    },
    duplicateOf: 'Lift 1 makes a grinding noise',
    reportedDaysAgo: 1,
  },
  {
    title: 'Repaint the parking bay numbers',
    category: 'Other',
    priority: 'Normal',
    where: { place: 'Parking' },
    description: 'The bay numbers in the parking are hard to read.',
    reporter: 'B/1B',
    path: ['Reported', "Won't fix"],
    reasons: { "Won't fix": 'Not a repair. The committee will decide on it at the next meeting.' },
    reportedDaysAgo: 8,
  },
  {
    title: 'Rusted pipe under the water pump',
    category: 'Plumbing',
    priority: 'Normal',
    where: { place: 'Water pump' },
    description: 'The inlet pipe under the pump is rusted through in one place and will leak soon.',
    reporter: 'staff',
    path: ['Reported'],
    linkedTo: 'Water pump trips the breaker',
    reportedDaysAgo: 1,
  },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A date `days` from today in Dhaka, as `YYYY-MM-DD`. */
function dhakaDate(days: number): string {
  return new Date(Date.now() + days * DAY).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

/** Adds the BR-13 places that are missing; returns place ids by name. */
async function seedPlaces(db: SeedDatabase): Promise<Map<string, string>> {
  await db
    .insert(commonAreaPlaces)
    .values(COMMON_AREA_PLACES.map((name) => ({ name })))
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(commonAreaPlaces)
    .where(inArray(commonAreaPlaces.name, [...COMMON_AREA_PLACES]));
  return new Map(rows.map((place) => [place.name, place.id]));
}

/** Looks up a demo profile id by username, or stops with a clear message. */
function profileId(ids: Map<string, string>, username: string): string {
  const id = ids.get(username);
  if (!id) throw new Error(`Demo account ${username} is missing. Seed the accounts first.`);
  return id;
}

/**
 * Adds the common-area places and the sample tickets, or puts existing sample tickets back to their demo state.
 * @param db - The seed's Drizzle client.
 * @param occupancyIds - Occupancy ids by `block/flat`, from the occupancy seed.
 * @param flatIds - Flat ids by `block/flat`, from the flat seed.
 * @returns How many places and sample tickets there are.
 * @throws Error if a demo account, flat or occupancy is missing, or if a sample history breaks the state machine.
 */
export async function seedTickets(
  db: SeedDatabase,
  occupancyIds: Map<string, string>,
  flatIds: Map<string, string>,
): Promise<{ places: number; tickets: number }> {
  const placeIds = await seedPlaces(db);

  const usernames = ['bb-manager', 'bb-maintenance', ...Object.values(RESIDENT_OF)];
  const profileRows = await db
    .select({ id: profiles.id, username: profiles.username })
    .from(profiles)
    .where(inArray(profiles.username, usernames));
  const profileIds = new Map(profileRows.map((p) => [p.username, p.id]));
  const managerId = profileId(profileIds, 'bb-manager');
  const maintenanceId = profileId(profileIds, 'bb-maintenance');

  const occupancyOf = (household: Household): string => {
    const id = occupancyIds.get(household);
    if (!id) throw new Error(`Occupancy of ${household} is missing.`);
    return id;
  };

  const ticketIds = new Map<string, string>();
  for (const sample of SAMPLE_TICKETS) {
    const status = sample.path.at(-1);
    if (status === undefined) throw new Error(`"${sample.title}" has no status.`);
    const byStaff = sample.reporter === 'staff';
    const household = sample.reporter === 'staff' ? null : sample.reporter;
    const reporterId = household ? profileId(profileIds, RESIDENT_OF[household]) : maintenanceId;
    const actorFor: Partial<Record<Role, string>> = {
      manager: managerId,
      maintenance: maintenanceId,
      resident: reporterId,
    };

    // Check every change against the state machine and work out who made it.
    const reportedAt = Date.now() - sample.reportedDaysAgo * DAY - 2 * HOUR;
    const changes = sample.path.map((to, step) => {
      const at = new Date(reportedAt + step * 3 * HOUR);
      const from = step === 0 ? null : sample.path[step - 1];
      if (!from) return { from: null, to, changedById: reporterId, reason: null, at };
      const role = TICKET_TRANSITIONS.find((t) => t.from === from && t.to === to)?.role;
      const transition = checkTicketTransition(from, to, role ?? 'resident', sample.reasons?.[to]);
      const changedById = actorFor[transition.role];
      if (!changedById)
        throw new Error(`"${sample.title}": no demo account for ${transition.role}.`);
      const reason = transition.needsReason ? (sample.reasons?.[to] ?? null) : null;
      return { from, to, changedById, reason, at };
    });

    let flatId: string | null = null;
    let placeId: string | null = null;
    if ('place' in sample.where) {
      placeId = placeIds.get(sample.where.place) ?? null;
      if (!placeId) throw new Error(`Place ${sample.where.place} is missing.`);
    } else {
      if (!household) throw new Error(`"${sample.title}": staff tickets need a place.`);
      flatId = flatIds.get(household) ?? null;
      if (!flatId) throw new Error(`Flat ${household} is missing.`);
    }

    const wasAssigned = sample.path.includes('Assigned');
    const values = {
      reportedById: reporterId,
      occupancyId: household ? occupancyOf(household) : null,
      category: sample.category,
      flatId,
      placeId,
      title: sample.title,
      description: sample.description,
      photoPath: null,
      homeTimes: sample.homeTimes ?? null,
      status,
      priority: sample.priority,
      assigneeId: wasAssigned ? maintenanceId : null,
      dueDate: wasAssigned ? dhakaDate(sample.dueInDays ?? 2) : null,
      instructions: sample.instructions ?? null,
      foundByStaff: byStaff,
      linkedTicketId: sample.linkedTo ? (ticketIds.get(sample.linkedTo) ?? null) : null,
      duplicateOfId: sample.duplicateOf ? (ticketIds.get(sample.duplicateOf) ?? null) : null,
      createdAt: new Date(reportedAt),
      updatedAt: changes.at(-1)?.at ?? new Date(reportedAt),
    };
    if (sample.linkedTo && !values.linkedTicketId) {
      throw new Error(`"${sample.title}" links to "${sample.linkedTo}", which comes later.`);
    }
    if (sample.duplicateOf && !values.duplicateOfId) {
      throw new Error(`"${sample.title}" duplicates "${sample.duplicateOf}", which comes later.`);
    }

    // The reporter's household follows its own ticket. A Duplicate's followers move to the original (BM-06), so the
    // original lists them in alsoFollowedBy instead.
    const followers =
      status === 'Duplicate'
        ? []
        : [...(household ? [household] : []), ...(sample.alsoFollowedBy ?? [])].map(occupancyOf);

    const id = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.title, sample.title));
      let ticketId: string;
      if (existing) {
        ticketId = existing.id;
        await tx.update(tickets).set(values).where(eq(tickets.id, ticketId));
        await tx.delete(ticketStatusChanges).where(eq(ticketStatusChanges.ticketId, ticketId));
        await tx.delete(ticketFollowers).where(eq(ticketFollowers.ticketId, ticketId));
      } else {
        const [created] = await tx.insert(tickets).values(values).returning({ id: tickets.id });
        if (!created) throw new Error(`Could not create "${sample.title}".`);
        ticketId = created.id;
      }
      await tx.insert(ticketStatusChanges).values(
        changes.map((change) => ({
          ticketId,
          fromStatus: change.from,
          toStatus: change.to,
          changedById: change.changedById,
          reason: change.reason,
          createdAt: change.at,
        })),
      );
      if (followers.length > 0) {
        await tx.insert(ticketFollowers).values(
          followers.map((occupancyId) => ({
            ticketId,
            occupancyId,
            createdAt: new Date(reportedAt),
          })),
        );
      }
      return ticketId;
    });
    ticketIds.set(sample.title, id);
  }

  return { places: placeIds.size, tickets: ticketIds.size };
}
