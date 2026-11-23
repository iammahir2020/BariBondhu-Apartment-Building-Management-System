/**
 * Role-check tests for `PATCH /api/expenses/[id]`: only the manager may edit, resubmit or correct (BM-08, NFR-06).
 *
 * @jest-environment node
 * @author Ayesha Siddiqa
 */
import { databaseExpenseStore } from '@/lib/adapters/expenseAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Expense } from '@/models';
import type { ExpenseStore } from '@/services/expenseService';
import { makeProfile } from '@/services/testFakes';
import { PATCH } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/expenseAdapters', () => ({ databaseExpenseStore: jest.fn() }));
jest.mock('@/services/auditService', () => ({
  databaseAuditWriter: jest.fn(() => jest.fn(async () => {})),
}));

function makeExpense(status: Expense['status']): Expense {
  return {
    id: 'expense-1',
    amountPoisha: 250000,
    expenseDate: '2026-01-01',
    category: 'repair',
    description: 'Lift motor',
    receiptPhoto: null,
    status,
    correctsExpenseId: null,
    editNote: null,
    recordedBy: 'user-1',
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function setUp(status: Expense['status']) {
  const expense = makeExpense(status);
  const store: ExpenseStore = {
    findById: jest.fn(async () => expense),
    insert: jest.fn(async () => expense),
    update: jest.fn(async () => expense),
    list: jest.fn(async () => [expense]),
  };
  jest.mocked(databaseExpenseStore).mockReturnValue(store);
  return store;
}

function allowManager(): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'user-1', role: 'manager' }), scope: 'all' });
}

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request('http://localhost/api/expenses/expense-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'expense-1' }) },
  );
}

const FIELDS = {
  amountPoisha: 300000,
  expenseDate: '2026-01-01',
  category: 'repair',
  description: 'Lift motor',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /api/expenses/[id]', () => {
  it('checks recordExpenses first and edits a waiting expense', async () => {
    const store = setUp('Waiting for approval');
    allowManager();
    const response = await patch({ action: 'edit', note: 'Final bill', ...FIELDS });

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'recordExpenses');
    expect(response.status).toBe(200);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('resubmits a rejected expense', async () => {
    const store = setUp('Rejected');
    allowManager();
    const response = await patch({ action: 'resubmit', ...FIELDS });
    expect(response.status).toBe(200);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('adds a correcting expense to an approved one and answers 201', async () => {
    const store = setUp('Approved');
    allowManager();
    const response = await patch({ action: 'correct', ...FIELDS, amountPoisha: -50000 });
    expect(response.status).toBe(201);
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it('answers 403 and changes nothing when the role is refused', async () => {
    const store = setUp('Waiting for approval');
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
    const response = await patch({ action: 'edit', note: 'x', ...FIELDS });

    expect(response.status).toBe(403);
    expect(store.findById).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('answers 409 when an approved expense is edited', async () => {
    const store = setUp('Approved');
    allowManager();
    const response = await patch({ action: 'edit', note: 'x', ...FIELDS });
    expect(response.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown action', async () => {
    setUp('Waiting for approval');
    allowManager();
    const response = await patch({ action: 'delete', ...FIELDS });
    expect(response.status).toBe(400);
  });
});
