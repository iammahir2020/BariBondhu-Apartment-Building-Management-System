/**
 * Demo data in place of features 2 and 3 (ADM-01 building setup, BM-02 accounts): one building, two blocks, twelve
 * flats, occupancies for some of them, and one account per role with a known password. Run with `npm run db:seed`.
 * Feature data has its own file next to this one, called from `main` once the accounts exist: `seedTickets.ts` for
 * the common-area places and sample fault tickets.
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
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Role } from '../src/lib/roles';
import * as schema from '../src/models';
import { internalEmail } from '../src/services/accountService';
import { passwordProblem } from '../src/services/passwordRules';
import { seedTickets } from './seedTickets';

loadEnvConfig(process.cwd());

const { auditLogs, blocks, buildings, flats, occupancies, profiles } = schema;

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
    displayName: 'Karim (guard)',
    phone: '01811000003',
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
    const ticketSeed = await seedTickets(db, occupancyIds, flatIds);
    console.log(
      `\nFault tickets: ${ticketSeed.places} common-area places, ${ticketSeed.tickets} sample tickets.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
