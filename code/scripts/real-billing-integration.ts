/**
 * BB-0508 Real PostgreSQL Billing Integration Test
 *
 * Tests:
 * 1. Monthly bill generation
 * 2. Carry forward of unpaid bills
 * 3. Excess credit adjustment
 * 4. Duplicate bill prevention
 * 5. Transaction rollback
 * 6. Audit log rollback
 *
 * Uses only the isolated Supabase test project.
 * All test records are rolled back.
 *
 * @author Jannatul Ferdus Nishi
 */

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../src/models';
import type { Database } from '../src/lib/db';

import { generateBillsWithCarryForward } from '../src/services/generateBillsWithCarryForward';

// --------------------------------------------------
// 1. TEST DATABASE SAFETY
// --------------------------------------------------

const uri = process.env.BILLING_TEST_DATABASE_URL;

if (!uri) {
  throw new Error('BILLING_TEST_DATABASE_URL is missing. Stopped.');
}

const target = new URL(uri);

if (
  target.username !== 'postgres.lscrvrcisiwmbjeaftlx' ||
  target.hostname !== 'aws-1-ap-southeast-1.pooler.supabase.com' ||
  target.port !== '5432' ||
  target.pathname !== '/postgres'
) {
  throw new Error('Unexpected database project or endpoint. Stopped.');
}

const client = postgres(uri, {
  ssl: 'require',
  prepare: false,
  max: 1,
  connect_timeout: 10,
});

const db: Database = drizzle(client, {
  schema,
  casing: 'snake_case',
});

type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

const month = '2026-12-01';
const due = '2026-12-20';

const rollbackMarker = new Error('BB0508_ISOLATED_TEST_ROLLBACK');

// --------------------------------------------------
// 2. TEST ASSERTION
// --------------------------------------------------

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// --------------------------------------------------
// 3. SHARED TRANSACTION WRAPPER
// --------------------------------------------------

function serviceDb(parentTx: DbTx): Database {
  return {
    transaction: async (callback: (tx: DbTx) => Promise<unknown>) =>
      parentTx.transaction(async (inner) => callback(inner as DbTx)),
  } as unknown as Database;
}

// --------------------------------------------------
// 4. AUTOMATIC TEST DATA ROLLBACK
// --------------------------------------------------

async function withTemporaryFixtures(
  label: string,
  action: (tx: DbTx) => Promise<void>,
): Promise<void> {
  let reachedChecks = false;

  try {
    await db.transaction(async (tx) => {
      await action(tx);

      reachedChecks = true;

      // Always roll back temporary test records.
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) {
      throw error;
    }
  }

  check(reachedChecks, `${label}: verification did not complete`);

  console.log(`PASS: ${label} (fixtures rolled back)`);
}

// --------------------------------------------------
// 5. CREATE TEMPORARY BILLING TEST RECORDS
// --------------------------------------------------

async function seedFixture(tx: DbTx, invalidUnpaid = false) {
  const managerId = randomUUID();
  const committeeId = randomUUID();

  const tag = managerId.slice(0, 8);

  // Temporary Supabase Auth users.
  await tx.execute(sql`
    INSERT INTO auth.users (id)
    VALUES
      (${managerId}::uuid),
      (${committeeId}::uuid)
  `);

  // Temporary profiles.
  await tx.insert(schema.profiles).values([
    {
      id: managerId,
      username: `bb0508_manager_${tag}`,
      role: 'manager',
      displayName: 'BB-0508 temporary manager',
      mustChangePassword: false,
    },
    {
      id: committeeId,
      username: `bb0508_committee_${tag}`,
      role: 'committee',
      displayName: 'BB-0508 temporary committee',
      mustChangePassword: false,
    },
  ]);

  // Create building.
  const [building] = await tx
    .insert(schema.buildings)
    .values({
      name: `BB-0508 isolated ${tag}`,
      address: 'Test only',
    })
    .returning();

  check(building, 'Could not create test building');

  // Create block.
  const [block] = await tx
    .insert(schema.blocks)
    .values({
      buildingId: building.id,
      name: 'A',
    })
    .returning();

  check(block, 'Could not create test block');

  // Create two flats.
  const flatRows = await tx
    .insert(schema.flats)
    .values([
      {
        blockId: block.id,
        number: '101',
        floor: 1,
      },
      {
        blockId: block.id,
        number: '102',
        floor: 1,
      },
    ])
    .returning();

  const [debtFlat, creditFlat] = flatRows;

  check(debtFlat && creditFlat, 'Could not create test flats');

  // Create active occupancies.
  const occupancyRows = await tx
    .insert(schema.occupancies)
    .values([
      {
        flatId: debtFlat.id,
        householdName: 'BB-0508 debt test',
        type: 'tenant',
        startDate: '2026-10-01',
      },
      {
        flatId: creditFlat.id,
        householdName: 'BB-0508 credit test',
        type: 'owner',
        startDate: '2026-10-01',
      },
    ])
    .returning();

  const [debtOccupancy, creditOccupancy] = occupancyRows;

  check(debtOccupancy && creditOccupancy, 'Could not create test occupancies');

  // Current charge rates.
  await tx.insert(schema.chargeRates).values([
    {
      chargeType: 'service',
      amountPoisha: 10000,
      meetingDate: '2026-11-15',
      setBy: committeeId,
      status: 'Current',
    },
    {
      chargeType: 'generator',
      amountPoisha: 5000,
      meetingDate: '2026-11-15',
      setBy: committeeId,
      status: 'Current',
    },
    {
      chargeType: 'water',
      amountPoisha: 5000,
      meetingDate: '2026-11-15',
      setBy: committeeId,
      status: 'Current',
    },
  ]);

  // November bills:
  // Flat 101: 30000 poisha unpaid debt.
  // Flat 102: 10000 poisha excess credit.
  const oldBills = await tx
    .insert(schema.bills)
    .values([
      {
        flatId: debtFlat.id,
        occupancyId: debtOccupancy.id,
        billingMonth: '2026-11-01',
        dueDate: '2026-11-20',
        totalPoisha: invalidUnpaid ? -10000 : 30000,
        status: 'Unpaid',
      },
      {
        flatId: creditFlat.id,
        occupancyId: creditOccupancy.id,
        billingMonth: '2026-11-01',
        dueDate: '2026-11-20',
        totalPoisha: -10000,
        status: 'Paid',
      },
    ])
    .returning();

  check(oldBills[0] && oldBills[1], 'Could not create older test bills');

  return {
    managerId,
    debtFlatId: debtFlat.id,
    creditFlatId: creditFlat.id,
    oldDebtId: oldBills[0].id,
    oldCreditId: oldBills[1].id,
  };
}

// --------------------------------------------------
// 6. REAL BILLING INTEGRATION TEST
// --------------------------------------------------

async function main(): Promise<void> {
  console.log('Starting BB-0508 Real Billing Integration Tests...');

  await withTemporaryFixtures('real bill generation + carry forward + credit', async (tx) => {
    const fixture = await seedFixture(tx);

    const runner = serviceDb(tx);

    // Execute actual billing service.
    const result = await generateBillsWithCarryForward(
      runner,
      {
        billingMonth: month,
        dueDate: due,
      },
      fixture.managerId,
    );

    check(result.createdCount === 2, `Expected two bills; got ${result.createdCount}`);

    // Retrieve new bills.
    const current = await tx
      .select()
      .from(schema.bills)
      .where(eq(schema.bills.billingMonth, month));

    const debtBill = current.find((bill) => bill.flatId === fixture.debtFlatId);

    const creditBill = current.find((bill) => bill.flatId === fixture.creditFlatId);

    // 20000 new charges + 30000 old debt.
    check(debtBill?.totalPoisha === 50000, 'Carry-forward total should be 50000 poisha');

    // 20000 new charges - 10000 credit.
    check(creditBill?.totalPoisha === 10000, 'Credit-adjusted total should be 10000 poisha');

    // Verify old debt status.
    const [oldDebt] = await tx
      .select()
      .from(schema.bills)
      .where(eq(schema.bills.id, fixture.oldDebtId));

    check(
      oldDebt?.status === 'Carried forward',
      'Earlier unpaid bill was not marked carried forward',
    );

    // Verify line items.
    const lines = await tx.select().from(schema.billLineItems);

    const carriedLines = lines.filter(
      (line) => line.type === 'carried_forward' && line.sourceBillId === fixture.oldDebtId,
    );

    check(carriedLines.length === 1, 'Expected exactly one carried-forward line');

    const creditLines = lines.filter(
      (line) =>
        line.type === 'credit' &&
        line.sourceBillId === fixture.oldCreditId &&
        line.amountPoisha === -10000,
    );

    check(creditLines.length === 1, 'Expected exactly one credit line');

    // Verify audit logs.
    const audits = await tx
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.actorId, fixture.managerId));

    check(
      audits.some((audit) => audit.action === 'bill.generate'),
      'Missing generation audit',
    );

    check(
      audits.some((audit) => audit.action === 'bill.carry_forward'),
      'Missing carry-forward audit',
    );

    check(
      audits.some((audit) => audit.action === 'bill.credit_apply'),
      'Missing credit audit',
    );

    // Duplicate generation must be rejected.
    let rejectedDuplicateRun = false;

    try {
      await generateBillsWithCarryForward(
        runner,
        {
          billingMonth: month,
          dueDate: due,
        },
        fixture.managerId,
      );
    } catch (error) {
      rejectedDuplicateRun = error instanceof Error && error.message.includes('already exist');
    }

    check(rejectedDuplicateRun, 'Duplicate monthly generation was not rejected');
  });

  // --------------------------------------------------
  // 7. FAILURE AND ROLLBACK TEST
  // --------------------------------------------------

  await withTemporaryFixtures(
    'real mid-generation failure rolls back bills and audit',
    async (tx) => {
      const fixture = await seedFixture(tx, true);

      const runner = serviceDb(tx);

      let failedAsExpected = false;

      try {
        await generateBillsWithCarryForward(
          runner,
          {
            billingMonth: month,
            dueDate: due,
          },
          fixture.managerId,
        );
      } catch (error) {
        failedAsExpected =
          error instanceof Error && error.message.includes('Invalid unpaid bill balance');
      }

      check(failedAsExpected, 'Expected invalid older Unpaid balance to stop generation');

      // New bills must not persist.
      const newBills = await tx
        .select()
        .from(schema.bills)
        .where(eq(schema.bills.billingMonth, month));

      check(newBills.length === 0, 'Generated bills were not rolled back');

      // Generation audit must not persist.
      const generationAudits = await tx
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.actorId, fixture.managerId),
            eq(schema.auditLogs.action, 'bill.generate'),
          ),
        );

      check(generationAudits.length === 0, 'Generation audit was not rolled back');
    },
  );

  console.log('BB-0508 REAL BILLING INTEGRATION: ALL CHECKS PASSED');
}

// --------------------------------------------------
// 8. RUN TEST AND CLOSE CONNECTION
// --------------------------------------------------

main()
  .catch((error: unknown) => {
    const err = error as {
      code?: string;
      message?: string;
    };

    console.error('BB-0508 TEST FAILED:', err.code ?? err.message ?? 'Unknown error');

    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
