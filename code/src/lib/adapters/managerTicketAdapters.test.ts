/**
 * BB-1306: Manager ticket adapter tests use mocked Drizzle operations only; no shared database is contacted.
 *
 * @author Jannatul Ferdus Nishi
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import { buildings, notifications, ticketFollowers, ticketStatusChanges, tickets } from '@/models';
import {
  databaseManagerBuildingId,
  databaseManagerTicketContext,
  databaseManagerTicketStore,
  managerTicketPhotoStore,
} from './managerTicketAdapters';

const BUILDING_ID = '123e4567-e89b-42d3-a456-426614174000';
const TICKET_ID = '223e4567-e89b-42d3-a456-426614174000';
const ORIGINAL_ID = '323e4567-e89b-42d3-a456-426614174000';
const STAFF_ID = '423e4567-e89b-42d3-a456-426614174000';
const NOW = new Date('2026-11-26T08:00:00.000Z');

interface SelectQuery extends Promise<unknown[]> {
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  for: jest.Mock;
}

function selectQuery(
  result: unknown[],
  onWhere: (condition: SQL) => void = () => undefined,
): SelectQuery {
  const query: SelectQuery = Object.assign(Promise.resolve(result), {
    from: jest.fn((): SelectQuery => query),
    innerJoin: jest.fn((): SelectQuery => query),
    leftJoin: jest.fn((): SelectQuery => query),
    where: jest.fn((condition: SQL) => {
      onWhere(condition);
      return query;
    }),
    orderBy: jest.fn((): SelectQuery => query),
    limit: jest.fn(async () => result),
    for: jest.fn((): SelectQuery => query),
  }) as SelectQuery;
  return query;
}

function setupDatabase(
  options: {
    selectResults?: unknown[][];
    updatedRows?: unknown[][];
    failHistoryInsert?: boolean;
  } = {},
) {
  const selectResults = [...(options.selectResults ?? [])];
  const updatedRows = [...(options.updatedRows ?? [[{ id: TICKET_ID }]])];
  const scopes: SQL[] = [];
  const writes: Array<{ table: unknown; values: unknown }> = [];
  const events: string[] = [];
  const returning = jest.fn(async () => updatedRows.shift() ?? []);
  const updateWhere = jest.fn(() => ({ returning }));
  const set = jest.fn(() => ({ where: updateWhere }));
  const update = jest.fn(() => ({ set }));

  const insert = jest.fn((table: unknown) => ({
    values: jest.fn((values: unknown) => {
      writes.push({ table, values });
      if (table === ticketFollowers) {
        return {
          onConflictDoNothing: jest.fn(async () => {
            events.push('insert-followers');
          }),
        };
      }
      if (table === ticketStatusChanges && options.failHistoryInsert) {
        return Promise.reject(new Error('History insert failed'));
      }
      if (table === ticketStatusChanges) events.push('insert-history');
      return Promise.resolve([]);
    }),
  }));
  const deleteWhere = jest.fn(async () => {
    events.push('delete-source-followers');
  });
  const remove = jest.fn(() => ({ where: deleteWhere }));
  const select = jest.fn(() =>
    selectQuery(selectResults.shift() ?? [], (condition) => scopes.push(condition)),
  );
  const tx = { select, update, insert, delete: remove };
  const transaction = jest.fn(async (callback: (transaction: typeof tx) => Promise<boolean>) =>
    callback(tx),
  );
  const db = { select, transaction } as unknown as Database;

  return {
    db,
    select,
    scopes,
    update,
    updateWhere,
    returning,
    insert,
    writes,
    events,
    transaction,
    delete: remove,
  };
}

function change(toStatus: 'Assigned' | 'Closed' | 'Duplicate' | "Won't fix") {
  return {
    id: 'change-1',
    ticketId: TICKET_ID,
    fromStatus: toStatus === 'Assigned' || toStatus === 'Closed' ? 'Fixed' : 'Reported',
    toStatus,
    changedById: 'manager-1',
    reason: toStatus === 'Duplicate' || toStatus === "Won't fix" ? 'Reviewed' : null,
    createdAt: NOW,
  } as const;
}

describe('databaseManagerBuildingId', () => {
  it('returns the only building ID', async () => {
    const query = selectQuery([{ id: BUILDING_ID }]);
    const db = { select: jest.fn(() => query) } as unknown as Database;

    await expect(databaseManagerBuildingId(db)).resolves.toBe(BUILDING_ID);
    expect(query.from).toHaveBeenCalledWith(buildings);
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it.each([{ rows: [] }, { rows: [{ id: BUILDING_ID }, { id: ORIGINAL_ID }] }])(
    'refuses a missing or ambiguous building configuration',
    async ({ rows }) => {
      const query = selectQuery(rows);
      const db = { select: jest.fn(() => query) } as unknown as Database;

      await expect(databaseManagerBuildingId(db)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Ticket access requires exactly one configured building.',
      });
    },
  );
});

describe('databaseManagerTicketStore', () => {
  it('wires manager status notices to persistent in-app notifications', async () => {
    const query = selectQuery([{ id: BUILDING_ID }]);
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn(() => ({ values }));
    const db = {
      select: jest.fn(() => query),
      insert,
    } as unknown as Database;

    const context = await databaseManagerTicketContext(db);
    await context.notices.notify({
      recipientId: STAFF_ID,
      text: 'A new ticket was assigned.',
      link: '/maintenance',
    });

    expect(insert).toHaveBeenCalledWith(notifications);
    expect(values).toHaveBeenCalledWith({
      recipientId: STAFF_ID,
      text: 'A new ticket was assigned.',
      link: '/maintenance',
    });
  });

  it('loads scoped ticket details with status history and work notes', async () => {
    const ticket = {
      id: TICKET_ID,
      status: 'Fixed',
      priority: 'High',
      assigneeId: STAFF_ID,
      dueDate: '2026-11-25',
      createdAt: NOW,
      title: 'Water leak',
      category: 'Plumbing',
      place: 'A / Flat 1',
      description: 'A pipe is leaking.',
      photoPath: 'tickets/ticket-1.jpg',
      homeTimes: null,
      instructions: 'Check the pipe.',
      foundByStaff: false,
      updatedAt: NOW,
      meTooCount: 2,
    };
    const statusChanges = [
      {
        fromStatus: 'In progress',
        toStatus: 'Fixed',
        reason: null,
        changedAt: NOW,
        changedByName: 'Ayesha Rahman',
      },
    ];
    const workNotes = [
      {
        id: 'note-1',
        text: 'Replaced the pipe.',
        createdAt: NOW,
        authorName: 'Ayesha Rahman',
      },
    ];
    const mocks = setupDatabase({ selectResults: [[ticket], statusChanges, workNotes] });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(store.findTicketDetails(TICKET_ID)).resolves.toEqual({
      ticket,
      statusChanges,
      workNotes,
    });
    expect(mocks.select).toHaveBeenCalledTimes(3);
    expect(mocks.scopes[0]).toBeDefined();
  });

  it('applies the building filter to ticket list reads', async () => {
    const mocks = setupDatabase();
    const query = selectQuery([], (condition) => mocks.scopes.push(condition));
    mocks.select.mockReturnValueOnce(query);
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await store.listTickets();

    expect(query.from).toHaveBeenCalledWith(tickets);
    const compiled = new PgDialect().sqlToQuery(mocks.scopes[0]!);
    expect(compiled.sql).toContain('"buildingId"');
    expect(compiled.sql).toContain('"placeId" is not null');
    expect(compiled.params).toContain(BUILDING_ID);
    expect(compiled.sql).toContain('"flats"');
    expect(compiled.sql).toContain('"blocks"');
  });

  it('creates a short-lived URL only after finding an in-building ticket photo', async () => {
    const mocks = setupDatabase({
      selectResults: [[{ id: BUILDING_ID }], [{ photoPath: 'tickets/ticket-1.jpg' }]],
    });
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed-photo' },
      error: null,
    });
    const admin = {
      storage: { from: jest.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;
    const store = managerTicketPhotoStore(mocks.db, admin);

    await expect(store.signedUrlForTicket(TICKET_ID)).resolves.toBe(
      'https://storage.example/signed-photo',
    );
    expect(createSignedUrl).toHaveBeenCalledWith('tickets/ticket-1.jpg', 300);
  });

  it('does not sign a ticket photo outside the building scope', async () => {
    const mocks = setupDatabase({
      selectResults: [[{ id: BUILDING_ID }], []],
    });
    const createSignedUrl = jest.fn();
    const admin = {
      storage: { from: jest.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;
    const store = managerTicketPhotoStore(mocks.db, admin);

    await expect(store.signedUrlForTicket(TICKET_ID)).resolves.toBeUndefined();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('surfaces storage signing errors', async () => {
    const mocks = setupDatabase({
      selectResults: [[{ id: BUILDING_ID }], [{ photoPath: 'tickets/ticket-1.jpg' }]],
    });
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: null,
      error: new Error('Storage unavailable'),
    });
    const admin = {
      storage: { from: jest.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = managerTicketPhotoStore(mocks.db, admin);

    await expect(store.signedUrlForTicket(TICKET_ID)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Could not load the ticket photo.',
    });
    consoleError.mockRestore();
  });

  it('updates assignment and status history in one transaction', async () => {
    const mocks = setupDatabase();
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveAssignmentIfReported({
        ticketId: TICKET_ID,
        staffId: STAFF_ID,
        priority: 'Urgent',
        dueDate: '2026-12-01',
        instructions: 'Check the pipe.',
        change: {
          ...change('Assigned'),
          fromStatus: 'Reported',
          toStatus: 'Assigned',
        },
      }),
    ).resolves.toBe(true);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(tickets);
    expect(mocks.updateWhere).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(ticketStatusChanges);
    expect(mocks.writes).toEqual([
      {
        table: ticketStatusChanges,
        values: expect.objectContaining({ ticketId: TICKET_ID, toStatus: 'Assigned' }),
      },
    ]);
  });

  it('does not save history if a concurrent assignment changed the ticket', async () => {
    const mocks = setupDatabase({ updatedRows: [[]] });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveAssignmentIfReported({
        ticketId: TICKET_ID,
        staffId: STAFF_ID,
        priority: 'Normal',
        dueDate: '2026-12-01',
        instructions: null,
        change: { ...change('Assigned'), fromStatus: 'Reported', toStatus: 'Assigned' },
      }),
    ).resolves.toBe(false);

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('propagates history-write failures so the database transaction can roll back', async () => {
    const mocks = setupDatabase({ failHistoryInsert: true });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveStatusChangeIfFixed({
        ticketId: TICKET_ID,
        status: 'Closed',
        change: change('Closed'),
      }),
    ).rejects.toThrow('History insert failed');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['Closed', 'Assigned'] as const)(
    'records a Fixed-to-%s transition only while still Fixed',
    async (status) => {
      const mocks = setupDatabase();
      const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

      await expect(
        store.saveStatusChangeIfFixed({
          ticketId: TICKET_ID,
          status,
          change: {
            ...change(status),
            ...(status === 'Assigned' ? { reason: 'Repair failed again' } : {}),
          },
        }),
      ).resolves.toBe(true);
      expect(mocks.updateWhere).toHaveBeenCalledTimes(1);
      expect(mocks.writes[0]?.values).toMatchObject({ toStatus: status });
    },
  );

  it("saves Won't fix without attempting a follower transfer", async () => {
    const mocks = setupDatabase({ selectResults: [[{ id: TICKET_ID, status: 'Reported' }]] });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveReportedDecisionIfUnchanged({
        ticketId: TICKET_ID,
        status: "Won't fix",
        duplicateOfId: null,
        change: change("Won't fix"),
      }),
    ).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith(tickets);
    expect(mocks.insert).toHaveBeenCalledWith(ticketStatusChanges);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('locks source and original, then transfers followers conflict-safely in the duplicate transaction', async () => {
    const source = { id: TICKET_ID, status: 'Reported' };
    const original = { id: ORIGINAL_ID, status: 'Assigned' };
    const followers = [{ occupancyId: 'occupancy-1' }, { occupancyId: 'occupancy-2' }];
    const mocks = setupDatabase({ selectResults: [[source, original], followers] });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveReportedDecisionIfUnchanged({
        ticketId: TICKET_ID,
        status: 'Duplicate',
        duplicateOfId: ORIGINAL_ID,
        change: change('Duplicate'),
      }),
    ).resolves.toBe(true);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenCalledWith(ticketFollowers);
    expect(mocks.insert).toHaveBeenCalledWith(ticketStatusChanges);
    expect(mocks.writes).toEqual(
      expect.arrayContaining([
        {
          table: ticketFollowers,
          values: [
            { ticketId: ORIGINAL_ID, occupancyId: 'occupancy-1' },
            { ticketId: ORIGINAL_ID, occupancyId: 'occupancy-2' },
          ],
        },
      ]),
    );
    expect(mocks.events).toEqual(['insert-followers', 'delete-source-followers', 'insert-history']);
  });

  it('refuses a final original ticket without changing followers or source status', async () => {
    const source = { id: TICKET_ID, status: 'Reported' };
    const original = { id: ORIGINAL_ID, status: 'Closed' };
    const mocks = setupDatabase({ selectResults: [[source, original]] });
    const store = databaseManagerTicketStore(mocks.db, BUILDING_ID);

    await expect(
      store.saveReportedDecisionIfUnchanged({
        ticketId: TICKET_ID,
        status: 'Duplicate',
        duplicateOfId: ORIGINAL_ID,
        change: change('Duplicate'),
      }),
    ).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
