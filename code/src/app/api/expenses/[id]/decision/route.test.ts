/**
 * Role-check tests for `POST /api/expenses/[id]/decision`: only the committee decides, a reject needs a reason, and
 * a decided expense cannot change (CM-02, NFR-06).
 *
 * @jest-environment node
 * @author Ayesha Siddiqa
 */
import { databaseExpenseStore } from '@/lib/adapters/expenseAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { Expense } from '@/models';
import type { ExpenseStore } from '@/services/expenseService';
import { makeProfile } from '@/services/testFakes';
import { POST } from './route';

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
    recordedBy: 'manager-1',
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

function allowCommittee(): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'user-1', role: 'committee' }), scope: 'all' });
}

function decide(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/expenses/expense-1/decision', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'expense-1' }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for deciding (NFR-06)', () => {
  it('only the committee may decide expenses', () => {
    expect(rolesFor('decideExpenses')).toEqual(['committee']);
  });
});

describe('POST /api/expenses/[id]/decision', () => {
  it('checks decideExpenses first and approves a waiting expense', async () => {
    const store = setUp('Waiting for approval');
    allowCommittee();
    const response = await decide({ decision: 'approve' });

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'decideExpenses');
    expect(response.status).toBe(200);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('rejects with a reason', async () => {
    const store = setUp('Waiting for approval');
    allowCommittee();
    const response = await decide({ decision: 'reject', reason: 'No receipt' });
    expect(response.status).toBe(200);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('answers 403 and changes nothing when the role is refused (the manager cannot approve)', async () => {
    const store = setUp('Waiting for approval');
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
    const response = await decide({ decision: 'approve' });

    expect(response.status).toBe(403);
    expect(store.findById).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('answers 400 "Write a reason" for a reject with no reason', async () => {
    const store = setUp('Waiting for approval');
    allowCommittee();
    const response = await decide({ decision: 'reject' });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Write a reason');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('answers 409 with the current status when it is already decided', async () => {
    const store = setUp('Approved');
    allowCommittee();
    const response = await decide({ decision: 'reject', reason: 'Too late' });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('This expense is already Approved.');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown decision', async () => {
    setUp('Waiting for approval');
    allowCommittee();
    const response = await decide({ decision: 'maybe' });
    expect(response.status).toBe(400);
  });
});
