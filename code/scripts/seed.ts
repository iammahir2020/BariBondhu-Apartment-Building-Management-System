/**
 * Demo data in place of features 2 and 3 (ADM-01 building setup, BM-02 accounts): one building, two blocks, twelve
 * flats, occupancies for some of them, and demo accounts with known passwords. Run with `npm run db:seed`.
 * Feature data has its own file next to this one, called from `main` once the accounts exist: `seedTickets.ts` for
 * the common-area places and sample fault tickets, `seedGuestPasses.ts` for the sample guest passes,
 * `seedEmergencyContacts.ts` for the guard-desk and manager emergency contacts, and `seedShifts.ts` for the
 * next seven days of guard shifts.
 *
 * Safe to run again: it finds what already exists by its natural key (building name, block name, flat number,
 * username) and only adds what is missing. Demo accounts get the demo password and first-login state back, so a
 * demo can always start from the same place.
 *
 * The demo password comes from `SEED_DEMO_PASSWORD` in `.env.local`, never from the repository, because the repo is
 * public and these accounts live in the shared Supabase project.
 *
 * @author Mahir Al Kamal
 */
import { seedEmergencyContacts } from './seedEmergencyContacts';
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Role } from '../src/lib/roles';
import * as schema from '../src/models';
import { internalEmail } from '../src/services/accountService';
import { passwordProblem } from '../src/services/passwordRules';
import { seedGuestPasses } from './seedGuestPasses';
import { seedTickets } from './seedTickets';
import { seedBills } from './seedBills';
import { seedShifts } from './seedShifts';

loadEnvConfig(process.cwd());

const {
  announcements,
  auditLogs,
  blocks,
  buildings,
  chargeRates,
  expenses,
  flats,
  occupancies,
  profiles,
} = schema;

/** The Drizzle client this script uses. */
type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

/** Reads a required variable or stops with a clear message. */
function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local.`);
  return value;
}

const BUILDING = { name: 'Bari Bondhu Tower', address: 'House 12, Road 5, Dhanmondi, Dhaka 1205' };

/** Two blocks, three floors, two flats a floor: 1A, 1B, 2A, 2B, 3A, 3B. */
const BLOCK_NAMES = ['A', 'B'] as const;
const FLOORS = [1, 2, 3] as const;
const FLAT_LETTERS = ['A', 'B'] as const;

/** Occupied flats (block, flat number); the rest stay vacant. */
const OCCUPANCIES = [
  {
    block: 'A',
    flat: '1A',
    householdName: 'Rahman family',
    type: 'owner',
    startDate: '2024-01-01',
  },
  {
    block: 'A',
    flat: '2B',
    householdName: 'Chowdhury family',
    type: 'tenant',
    startDate: '2025-07-01',
  },
  {
    block: 'B',
    flat: '1B',
    householdName: 'Hossain family',
    type: 'owner',
    startDate: '2023-03-15',
  },
  {
    block: 'B',
    flat: '3A',
    householdName: 'Akter family',
    type: 'tenant',
    startDate: '2026-11-01',
  },
] as const;

/** A demo account. Residents name the occupied flat they belong to. */
interface DemoAccount {
  username: string;
  role: Role;
  displayName: string;
  phone: string | null;
  flat?: { block: string; flat: string };
  /** True for the one account that shows the first-login password change (BR-15). */
  mustChangePassword: boolean;
}

/**
 * Demo usernames follow the `bb-` pattern but are readable, so a demo can be run from the README. Real accounts
 * always get generated usernames (NFR-05).
 */
const ACCOUNTS: readonly DemoAccount[] = [
  {
    username: 'bb-resident1',
    role: 'resident',
    displayName: 'Rahman family',
    phone: '01711000001',
    flat: { block: 'A', flat: '1A' },
    mustChangePassword: false,
  },
  {
    username: 'bb-resident2',
    role: 'resident',
    displayName: 'Hossain family',
    phone: '01711000002',
    flat: { block: 'B', flat: '1B' },
    mustChangePassword: false,
  },
  {
    username: 'bb-guard',
    role: 'guard',
    displayName: 'Selim (guard)',
    phone: '01811000003',
    mustChangePassword: false,
  },
  {
    username: 'bb-guard-hanif',
    role: 'guard',
    displayName: 'Hanif (guard)',
    phone: '01811000009',
    mustChangePassword: false,
  },
  {
    username: 'bb-guard-babul',
    role: 'guard',
    displayName: 'Babul (guard)',
    phone: '01811000010',
    mustChangePassword: false,
  },
  {
    username: 'bb-manager',
    role: 'manager',
    displayName: 'Nasrin Sultana (manager)',
    phone: '01911000004',
    mustChangePassword: false,
  },
  {
    username: 'bb-committee',
    role: 'committee',
    displayName: 'Abdul Haque (committee)',
    phone: null,
    mustChangePassword: false,
  },
  {
    username: 'bb-maintenance',
    role: 'maintenance',
    displayName: 'Jamal (maintenance)',
    phone: '01611000006',
    mustChangePassword: false,
  },
  {
    username: 'bb-admin',
    role: 'admin',
    displayName: 'System administrator',
    phone: null,
    mustChangePassword: false,
  },
  {
    username: 'bb-firstlogin',
    role: 'resident',
    displayName: 'Chowdhury family',
    phone: '01711000008',
    flat: { block: 'A', flat: '2B' },
    mustChangePassword: true,
  },
];

/**
 * Demo announcements for BM-11 and RES-08.
 *
 * @author Jannatul Ferdus Nishi
 */
const DEMO_ANNOUNCEMENTS = [
  {
    title: '[Demo] Building Maintenance Notice',
    message: 'Routine maintenance will be carried out this week.',
    audience: 'All',
    urgent: false,
  },
  {
    title: '[Demo] Block A Cleaning Notice',
    message: 'Cleaning work is scheduled for Block A.',
    audience: 'Block',
    targetBlock: 'A',
    urgent: false,
  },
  {
    title: '[Demo] Floor 2 Water Supply Notice',
    message: 'Water supply maintenance is planned for Floor 2.',
    audience: 'Floor',
    targetFloor: 2,
    urgent: false,
  },
  {
    title: '[Demo] Urgent Power Supply Notice',
    message: 'Temporary power interruption. Please check updates.',
    audience: 'All',
    urgent: true,
  },
] as const;

/** Finds or creates the building, blocks and flats; returns flat ids by `block/flat`. */
async function seedFlats(db: SeedDatabase): Promise<Map<string, string>> {
  let [building] = await db.select().from(buildings).where(eq(buildings.name, BUILDING.name));
  building ??= (await db.insert(buildings).values(BUILDING).returning())[0];
  if (!building) throw new Error('Could not create the building.');

  const flatIds = new Map<string, string>();
  for (const blockName of BLOCK_NAMES) {
    await db
      .insert(blocks)
      .values({ buildingId: building.id, name: blockName })
      .onConflictDoNothing();
    const [block] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.buildingId, building.id), eq(blocks.name, blockName)));
    if (!block) throw new Error(`Could not create block ${blockName}.`);

    const rows = FLOORS.flatMap((floor) =>
      FLAT_LETTERS.map((letter) => ({ blockId: block.id, number: `${floor}${letter}`, floor })),
    );
    await db.insert(flats).values(rows).onConflictDoNothing();
    for (const flat of await db.select().from(flats).where(eq(flats.blockId, block.id))) {
      flatIds.set(`${blockName}/${flat.number}`, flat.id);
    }
  }
  return flatIds;
}

/** Gives each listed flat an active occupancy if it has none; returns occupancy ids by `block/flat`. */
async function seedOccupancies(
  db: SeedDatabase,
  flatIds: Map<string, string>,
): Promise<Map<string, string>> {
  const occupancyIds = new Map<string, string>();
  for (const occupancy of OCCUPANCIES) {
    const key = `${occupancy.block}/${occupancy.flat}`;
    const flatId = flatIds.get(key);
    if (!flatId) throw new Error(`Flat ${key} is missing.`);
    let [active] = await db
      .select()
      .from(occupancies)
      .where(and(eq(occupancies.flatId, flatId), isNull(occupancies.endDate)));
    active ??= (
      await db
        .insert(occupancies)
        .values({
          flatId,
          householdName: occupancy.householdName,
          type: occupancy.type,
          startDate: occupancy.startDate,
        })
        .returning()
    )[0];
    if (!active) throw new Error(`Could not create the occupancy of ${key}.`);
    occupancyIds.set(key, active.id);
  }
  return occupancyIds;
}

/** Creates a demo account, or puts an existing one back to its demo state. */
async function seedAccount(
  db: SeedDatabase,
  admin: SupabaseClient,
  account: DemoAccount,
  occupancyIds: Map<string, string>,
  password: string,
): Promise<'created' | 'reset'> {
  const occupancyId = account.flat
    ? occupancyIds.get(`${account.flat.block}/${account.flat.flat}`)
    : null;
  if (occupancyId === undefined) throw new Error(`No occupancy for ${account.username}.`);

  const state = {
    role: account.role,
    displayName: account.displayName,
    phone: account.phone,
    occupancyId,
    mustChangePassword: account.mustChangePassword,
    tempPasswordExpiresAt: account.mustChangePassword
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : null,
    active: true,
  };

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.username, account.username));
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
    await db.update(profiles).set(state).where(eq(profiles.id, existing.id));
    return 'reset';
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: internalEmail(account.username),
    password,
    email_confirm: true,
  });
  if (error) throw error;
  try {
    await db.insert(profiles).values({ id: data.user.id, username: account.username, ...state });
  } catch (insertError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw insertError;
  }
  await db.insert(auditLogs).values({
    actorId: null,
    action: 'account.create',
    entityType: 'profiles',
    entityId: data.user.id,
    oldValues: null,
    newValues: { username: account.username, role: account.role, source: 'seed' },
  });
  return 'created';
}

/**
 * Adds demo announcements without duplicating existing titles.
 * Requires the Announcement migration to be applied first.
 *
 * @author Jannatul Ferdus Nishi
 */
async function seedAnnouncements(db: SeedDatabase): Promise<void> {
  const [manager] = await db.select().from(profiles).where(eq(profiles.username, 'bb-manager'));

  if (!manager) {
    throw new Error('Demo manager account is missing.');
  }

  const [building] = await db.select().from(buildings).where(eq(buildings.name, BUILDING.name));

  if (!building) {
    throw new Error('Demo building is missing.');
  }

  const [blockA] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.buildingId, building.id), eq(blocks.name, 'A')));

  if (!blockA) {
    throw new Error('Block A is missing.');
  }

  for (const item of DEMO_ANNOUNCEMENTS) {
    const [existing] = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.title, item.title))
      .limit(1);

    if (existing) {
      console.log(`Announcement already exists: ${item.title}`);
      continue;
    }

    await db.insert(announcements).values({
      title: item.title,
      message: item.message,
      audience: item.audience,
      targetBlockId: 'targetBlock' in item ? blockA.id : null,
      targetFloor: 'targetFloor' in item ? item.targetFloor : null,
      urgent: item.urgent,
      expiresAt: item.urgent ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
      status: 'Published',
      createdById: manager.id,
    });

    console.log(`Created announcement: ${item.title}`);
  }
}

/** Demo rates the committee set at a meeting: one Current rate for each charge (CM-01). Amounts are whole poisha. */
const RATES = [
  { chargeType: 'service', amountPoisha: 150000 },
  { chargeType: 'generator', amountPoisha: 50000 },
  { chargeType: 'water', amountPoisha: 30000 },
] as const;

/**
 * Adds a Current rate for each charge that has none yet, set by the demo committee account.
 * @param db - The seed script's database client.
 * @returns How many rates were added.
 */
async function seedChargeRates(db: SeedDatabase): Promise<number> {
  const [committee] = await db.select().from(profiles).where(eq(profiles.username, 'bb-committee'));
  if (!committee) throw new Error('The bb-committee account is missing.');

  let added = 0;
  for (const rate of RATES) {
    const [current] = await db
      .select()
      .from(chargeRates)
      .where(and(eq(chargeRates.chargeType, rate.chargeType), eq(chargeRates.status, 'Current')));
    if (current) continue;
    await db.insert(chargeRates).values({
      chargeType: rate.chargeType,
      amountPoisha: rate.amountPoisha,
      meetingDate: '2026-11-01',
      setBy: committee.id,
      status: 'Current',
    });
    added += 1;
  }
  return added;
}

/** Demo expenses, one in each state, so every screen has something to show (BM-08, CM-02). Amounts are whole poisha. */
const EXPENSES = [
  {
    description: 'Lift 1 motor repair',
    amountPoisha: 1200000,
    expenseDate: '2026-11-05',
    category: 'repair',
    status: 'Approved',
    decisionReason: null,
  },
  {
    description: 'Guard salary, November',
    amountPoisha: 1800000,
    expenseDate: '2026-11-10',
    category: 'salary',
    status: 'Waiting for approval',
    decisionReason: null,
  },
  {
    description: 'Lobby decoration',
    amountPoisha: 500000,
    expenseDate: '2026-11-12',
    category: 'other',
    status: 'Rejected',
    decisionReason: 'Not agreed at the committee meeting',
  },
] as const;

/**
 * Adds one demo expense in each state, recorded by the demo manager and decided by the demo committee account.
 * @param db - The seed script's database client.
 * @returns How many expenses were added.
 */
async function seedExpenses(db: SeedDatabase): Promise<number> {
  const [manager] = await db.select().from(profiles).where(eq(profiles.username, 'bb-manager'));
  const [committee] = await db.select().from(profiles).where(eq(profiles.username, 'bb-committee'));
  if (!manager || !committee) throw new Error('The bb-manager or bb-committee account is missing.');

  let added = 0;
  for (const expense of EXPENSES) {
    const [existing] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.description, expense.description));
    if (existing) continue;
    const decided = expense.status !== 'Waiting for approval';
    await db.insert(expenses).values({
      amountPoisha: expense.amountPoisha,
      expenseDate: expense.expenseDate,
      category: expense.category,
      description: expense.description,
      status: expense.status,
      recordedBy: manager.id,
      decidedBy: decided ? committee.id : null,
      decidedAt: decided ? new Date() : null,
      decisionReason: expense.decisionReason,
    });
    added += 1;
  }
  return added;
}

async function main(): Promise<void> {
  const password = env('SEED_DEMO_PASSWORD');
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SEED_DEMO_PASSWORD: ${problem}`);

  const client = postgres(env('DATABASE_URL'), { prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const flatIds = await seedFlats(db);
    const occupancyIds = await seedOccupancies(db, flatIds);
    console.log(
      `Building "${BUILDING.name}": ${flatIds.size} flats, ${occupancyIds.size} occupied.`,
    );
    console.log('\nDemo accounts (password: SEED_DEMO_PASSWORD in .env.local)');
    for (const account of ACCOUNTS) {
      const result = await seedAccount(db, admin, account, occupancyIds, password);
      const where = account.flat ? ` · flat ${account.flat.block}-${account.flat.flat}` : '';
      const first = account.mustChangePassword ? ' · must set a new password' : '';
      console.log(
        `  ${account.username.padEnd(15)} ${account.role.padEnd(12)} ${result}${where}${first}`,
      );
    }

    // Seed guard shifts only after all three demo guard accounts exist.
    const shiftCount = await seedShifts(db);
    console.log(`\nGuard shifts: ${shiftCount} new shifts added.`);

    await seedAnnouncements(db);

    const ticketSeed = await seedTickets(db, occupancyIds, flatIds);
    console.log(
      `\nFault tickets: ${ticketSeed.places} common-area places, ${ticketSeed.tickets} sample tickets.`,
    );

    const addedRates = await seedChargeRates(db);
    console.log(`\nCharge rates: ${addedRates} added.`);

    const addedExpenses = await seedExpenses(db);
    console.log(`Expenses: ${addedExpenses} added.`);

    const addedBills = await seedBills(db, flatIds, occupancyIds);
    console.log(`Demo monthly bills: ${addedBills} created.`);

    const passCount = await seedGuestPasses(db);
    console.log(`\nGuest passes: ${passCount} sample passes, one in each state, times from now.`);
    const emergencyContactCount = await seedEmergencyContacts(db);
    console.log(`Emergency contacts: ${emergencyContactCount} building contacts configured.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
