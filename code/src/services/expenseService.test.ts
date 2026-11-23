/**
 * Tests for recording expenses: record, edit while waiting, resubmit after a rejection, and add a correcting
 * expense. Bad input is refused with the SRS wording, and every change is audited (BM-08, NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import type { Expense, NewExpense } from '@/models';
import {
  APPROVED_EXPENSE_MESSAGE,
  CHECK_EXPENSE_DATE_MESSAGE,
  EDIT_NOTE_MESSAGE,
  addCorrectingExpense,
  editExpense,
  recordExpense,
  resubmitExpense,
  type ExpenseDeps,
  type ExpenseInput,
  type ExpenseStore,
} from '@/services/expenseService';
import { memoryAudit } from '@/services/testFakes';

const MANAGER_ID = 'manager-1';
/** 23 Nov 2026, 12:00 in Dhaka. */
const NOW = new Date('2026-11-23T06:00:00Z');

/** An in-memory expense store. */
class MemoryExpenseStore implements ExpenseStore {
  readonly rows: Expense[] = [];

  async findById(id: string): Promise<Expense | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async insert(expense: NewExpense): Promise<Expense> {
    const row: Expense = {
      id: `expense-${this.rows.length + 1}`,
      amountPoisha: expense.amountPoisha,
      expenseDate: expense.expenseDate,
      category: expense.category,
      description: expense.description,
      receiptPhoto: expense.receiptPhoto ?? null,
      status: expense.status ?? 'Waiting for approval',
      correctsExpenseId: expense.correctsExpenseId ?? null,
      editNote: expense.editNote ?? null,
      recordedBy: expense.recordedBy,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, changes: Partial<NewExpense>): Promise<Expense> {
    const index = this.rows.findIndex((item) => item.id === id);
    const row = this.rows[index];
    if (!row) throw new Error('No such expense');
    const updated: Expense = { ...row, ...changes } as Expense;
    this.rows[index] = updated;
    return updated;
  }
}

function setUp() {
  const store = new MemoryExpenseStore();
  const { audit, entries } = memoryAudit();
  const deps: ExpenseDeps = { expenses: store, audit };
  return { deps, store, entries };
}

/** A valid input, with fields to change. */
function input(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    amountPoisha: 250000,
    expenseDate: '2026-11-20',
    category: 'repair',
    description: 'Lift 1 motor repair',
    receiptPhoto: null,
    ...overrides,
  };
}

/** Records an expense and forces it into a status, as the committee decision would. */
async function recordWithStatus(
  setup: ReturnType<typeof setUp>,
  status: Expense['status'],
): Promise<Expense> {
  const created = await recordExpense(setup.deps, input(), MANAGER_ID, NOW);
  const row = setup.store.rows.find((item) => item.id === created.id);
  if (!row) throw new Error('missing row');
  row.status = status;
  if (status === 'Rejected') {
    row.decidedBy = 'committee-1';
    row.decisionReason = 'No receipt';
  }
  return row;
}

describe('recordExpense', () => {
  it('saves an expense as Waiting for approval and logs it (normal, BM-08)', async () => {
    const { deps, store, entries } = setUp();
    const created = await recordExpense(
      deps,
      input({ description: '  Lift repair  ' }),
      MANAGER_ID,
      NOW,
    );

    expect(created).toMatchObject({
      amountPoisha: 250000,
      category: 'repair',
      description: 'Lift repair',
      status: 'Waiting for approval',
      recordedBy: MANAGER_ID,
    });
    expect(store.rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: MANAGER_ID,
      action: 'expense.record',
      entityType: 'expenses',
      entityId: created.id,
      oldValues: null,
    });
  });

  it('accepts an expense dated today (boundary)', async () => {
    const { deps } = setUp();
    const created = await recordExpense(
      deps,
      input({ expenseDate: '2026-11-23' }),
      MANAGER_ID,
      NOW,
    );
    expect(created.expenseDate).toBe('2026-11-23');
  });

  it('uses the Dhaka date: 00:30 on the 24th in Dhaka is still the 23rd in UTC (boundary, BR-01)', async () => {
    const { deps } = setUp();
    const lateNight = new Date('2026-11-23T18:30:00Z');
    const created = await recordExpense(
      deps,
      input({ expenseDate: '2026-11-24' }),
      MANAGER_ID,
      lateNight,
    );
    expect(created.expenseDate).toBe('2026-11-24');
  });

  it('refuses a future date with the SRS message and saves nothing (invalid input)', async () => {
    const { deps, store, entries } = setUp();
    await expect(
      recordExpense(deps, input({ expenseDate: '2026-11-24' }), MANAGER_ID, NOW),
    ).rejects.toMatchObject({ status: 400, message: CHECK_EXPENSE_DATE_MESSAGE });
    expect(store.rows).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('uses the exact SRS wording (BM-08)', () => {
    expect(CHECK_EXPENSE_DATE_MESSAGE).toBe('Check the expense date');
  });

  it.each<[string, ExpenseInput]>([
    ['a missing date', input({ expenseDate: null })],
    ['a date that is not a date', input({ expenseDate: 'yesterday' })],
    ['a date that does not exist', input({ expenseDate: '2026-02-30' })],
  ])('refuses %s with "Check the expense date" (invalid input)', async (_name, bad) => {
    const { deps } = setUp();
    await expect(recordExpense(deps, bad, MANAGER_ID, NOW)).rejects.toMatchObject({
      status: 400,
      message: CHECK_EXPENSE_DATE_MESSAGE,
    });
  });

  it.each<[string, ExpenseInput]>([
    ['a blank amount', input({ amountPoisha: null })],
    ['an amount of 0', input({ amountPoisha: 0 })],
    ['a negative amount', input({ amountPoisha: -100 })],
    ['an amount that is not whole poisha', input({ amountPoisha: 10.5 })],
    ['a missing category', input({ category: null })],
    ['an empty description', input({ description: '   ' })],
  ])('refuses %s and saves nothing (invalid input)', async (_name, bad) => {
    const { deps, store, entries } = setUp();
    await expect(recordExpense(deps, bad, MANAGER_ID, NOW)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
    });
    expect(store.rows).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('keeps an optional receipt photo (normal)', async () => {
    const { deps } = setUp();
    const created = await recordExpense(
      deps,
      input({ receiptPhoto: ' receipts/lift.jpg ' }),
      MANAGER_ID,
      NOW,
    );
    expect(created.receiptPhoto).toBe('receipts/lift.jpg');
  });

  it('writes no audit entry if saving fails (exception)', async () => {
    const { deps, entries } = setUp();
    deps.expenses.insert = async () => Promise.reject(new Error('save failed'));
    await expect(recordExpense(deps, input(), MANAGER_ID, NOW)).rejects.toThrow('save failed');
    expect(entries).toHaveLength(0);
  });
});

describe('editExpense', () => {
  it('changes a waiting expense, saves the note and logs old and new values (normal)', async () => {
    const setup = setUp();
    const created = await recordExpense(setup.deps, input(), MANAGER_ID, NOW);
    const after = await editExpense(
      setup.deps,
      created.id,
      input({ amountPoisha: 300000 }),
      'Final bill was higher',
      MANAGER_ID,
      NOW,
    );

    expect(after).toMatchObject({
      amountPoisha: 300000,
      editNote: 'Final bill was higher',
      status: 'Waiting for approval',
    });
    expect(setup.entries[1]).toMatchObject({
      action: 'expense.edit',
      oldValues: { amountPoisha: 250000 },
      newValues: { amountPoisha: 300000, editNote: 'Final bill was higher' },
    });
  });

  it('refuses an edit with no note (invalid input)', async () => {
    const setup = setUp();
    const created = await recordExpense(setup.deps, input(), MANAGER_ID, NOW);
    await expect(
      editExpense(setup.deps, created.id, input(), '   ', MANAGER_ID, NOW),
    ).rejects.toMatchObject({ status: 400, message: EDIT_NOTE_MESSAGE });
    await expect(
      editExpense(setup.deps, created.id, input(), null, MANAGER_ID, NOW),
    ).rejects.toMatchObject({ status: 400, message: EDIT_NOTE_MESSAGE });
  });

  it('refuses a future date on edit (invalid input)', async () => {
    const setup = setUp();
    const created = await recordExpense(setup.deps, input(), MANAGER_ID, NOW);
    await expect(
      editExpense(
        setup.deps,
        created.id,
        input({ expenseDate: '2026-12-01' }),
        'Fix date',
        MANAGER_ID,
        NOW,
      ),
    ).rejects.toMatchObject({ message: CHECK_EXPENSE_DATE_MESSAGE });
  });

  it('cannot edit an Approved expense; it points to a correcting expense (BM-08, CM-02)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    await expect(
      editExpense(setup.deps, approved.id, input(), 'Change', MANAGER_ID, NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409, message: APPROVED_EXPENSE_MESSAGE });
  });

  it('cannot edit a Rejected expense; it must be resubmitted (exception)', async () => {
    const setup = setUp();
    const rejected = await recordWithStatus(setup, 'Rejected');
    await expect(
      editExpense(setup.deps, rejected.id, input(), 'Change', MANAGER_ID, NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('answers 404 for an expense that does not exist (exception)', async () => {
    const { deps } = setUp();
    await expect(editExpense(deps, 'nope', input(), 'Note', MANAGER_ID, NOW)).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
        status: 404,
      },
    );
  });
});

describe('resubmitExpense', () => {
  it('sends a Rejected expense back to Waiting for approval and clears the decision (normal, BM-08)', async () => {
    const setup = setUp();
    const rejected = await recordWithStatus(setup, 'Rejected');
    const after = await resubmitExpense(
      setup.deps,
      rejected.id,
      input({ description: 'Lift motor repair with receipt', receiptPhoto: 'receipts/lift.jpg' }),
      MANAGER_ID,
      NOW,
    );

    expect(after).toMatchObject({
      status: 'Waiting for approval',
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      description: 'Lift motor repair with receipt',
    });
    expect(setup.entries.at(-1)).toMatchObject({
      action: 'expense.resubmit',
      oldValues: { status: 'Rejected', decisionReason: 'No receipt' },
      newValues: { status: 'Waiting for approval' },
    });
  });

  it.each<Expense['status']>(['Waiting for approval', 'Approved'])(
    'refuses an expense that is %s (invalid state)',
    async (status) => {
      const setup = setUp();
      const row = await recordWithStatus(setup, status);
      await expect(
        resubmitExpense(setup.deps, row.id, input(), MANAGER_ID, NOW),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    },
  );

  it('refuses a future date on resubmit and leaves it Rejected (invalid input)', async () => {
    const setup = setUp();
    const rejected = await recordWithStatus(setup, 'Rejected');
    await expect(
      resubmitExpense(
        setup.deps,
        rejected.id,
        input({ expenseDate: '2026-12-01' }),
        MANAGER_ID,
        NOW,
      ),
    ).rejects.toMatchObject({ message: CHECK_EXPENSE_DATE_MESSAGE });
    expect(rejected.status).toBe('Rejected');
  });

  it('answers 404 for an expense that does not exist (exception)', async () => {
    const { deps } = setUp();
    await expect(resubmitExpense(deps, 'nope', input(), MANAGER_ID, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('addCorrectingExpense', () => {
  it('adds a negative correcting expense linked to the Approved one (normal, BM-08)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    const correcting = await addCorrectingExpense(
      setup.deps,
      approved.id,
      input({ amountPoisha: -50000, description: 'Refund from supplier' }),
      MANAGER_ID,
      NOW,
    );

    expect(correcting).toMatchObject({
      amountPoisha: -50000,
      correctsExpenseId: approved.id,
      status: 'Waiting for approval',
    });
    expect(approved.amountPoisha).toBe(250000);
    expect(setup.entries.at(-1)).toMatchObject({
      action: 'expense.correct',
      entityId: correcting.id,
      newValues: { correctsExpenseId: approved.id },
    });
  });

  it('accepts a positive correcting amount (normal)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    const correcting = await addCorrectingExpense(
      setup.deps,
      approved.id,
      input({ amountPoisha: 20000 }),
      MANAGER_ID,
      NOW,
    );
    expect(correcting.amountPoisha).toBe(20000);
  });

  it('refuses a correcting amount of 0 (boundary)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    await expect(
      addCorrectingExpense(setup.deps, approved.id, input({ amountPoisha: 0 }), MANAGER_ID, NOW),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a future date with the SRS message (invalid input)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    await expect(
      addCorrectingExpense(
        setup.deps,
        approved.id,
        input({ expenseDate: '2026-12-01' }),
        MANAGER_ID,
        NOW,
      ),
    ).rejects.toMatchObject({ message: CHECK_EXPENSE_DATE_MESSAGE });
  });

  it.each<Expense['status']>(['Waiting for approval', 'Rejected'])(
    'refuses a correction of an expense that is %s (invalid state)',
    async (status) => {
      const setup = setUp();
      const row = await recordWithStatus(setup, status);
      await expect(
        addCorrectingExpense(setup.deps, row.id, input({ amountPoisha: -100 }), MANAGER_ID, NOW),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    },
  );

  it('answers 404 when the original does not exist (exception)', async () => {
    const { deps } = setUp();
    await expect(
      addCorrectingExpense(deps, 'nope', input({ amountPoisha: -100 }), MANAGER_ID, NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows editing a correcting expense with a negative amount while it waits (normal)', async () => {
    const setup = setUp();
    const approved = await recordWithStatus(setup, 'Approved');
    const correcting = await addCorrectingExpense(
      setup.deps,
      approved.id,
      input({ amountPoisha: -50000 }),
      MANAGER_ID,
      NOW,
    );
    const after = await editExpense(
      setup.deps,
      correcting.id,
      input({ amountPoisha: -60000 }),
      'Refund was larger',
      MANAGER_ID,
      NOW,
    );
    expect(after.amountPoisha).toBe(-60000);
  });
});
