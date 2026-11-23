/**
 * Role-check tests for `/api/expenses`: the role check runs first with the right action, a refused role reaches
 * nothing, and bad input gets the SRS message (BM-08, NFR-06).
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
import { GET, POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/expenseAdapters', () => ({ databaseExpenseStore: jest.fn() }));
jest.mock('@/services/auditService', () => ({
  databaseAuditWriter: jest.fn(() => jest.fn(async () => {})),
}));

const SAVED: Expense = {
  id: 'expense-1',
  amountPoisha: 250000,
  expenseDate: '2026-11-20',
  category: 'repair',
  description: 'Lift motor',
  receiptPhoto: null,
  status: 'Waiting for approval',
  correctsExpenseId: null,
  editNote: null,
  recordedBy: 'user-1',
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  createdAt: new Date('2026-11-20T00:00:00Z'),
  updatedAt: new Date('2026-11-20T00:00:00Z'),
};

function setUp() {
  const store: ExpenseStore = {
    findById: jest.fn(async () => SAVED),
    insert: jest.fn(async () => SAVED),
    update: jest.fn(async () => SAVED),
    list: jest.fn(async () => [SAVED]),
  };
  jest.mocked(databaseExpenseStore).mockReturnValue(store);
  return store;
}

function allow(role: 'manager' | 'committee'): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'user-1', role }), scope: 'all' });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/expenses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const GOOD_BODY = {
  amountPoisha: 250000,
  expenseDate: '2026-01-01',
  category: 'repair',
  description: 'Lift motor',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for expenses (NFR-06)', () => {
  it('only the manager records; manager and committee see the list', () => {
    expect(rolesFor('recordExpenses')).toEqual(['manager']);
    expect(rolesFor('viewExpenses')).toEqual(['manager', 'committee']);
  });
});

describe('GET /api/expenses', () => {
  it('checks viewExpenses first and returns the list', async () => {
    const store = setUp();
    allow('committee');
    const response = await GET(new Request('http://localhost/api/expenses'));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewExpenses');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { expenses: unknown[] };
    expect(body.expenses).toHaveLength(1);
    expect(store.list).toHaveBeenCalled();
  });

  it('answers 403 and reads nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await GET(new Request('http://localhost/api/expenses'));
    expect(response.status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/expenses', () => {
  it('checks recordExpenses first and saves the expense', async () => {
    const store = setUp();
    allow('manager');
    const response = await POST(postRequest(GOOD_BODY));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'recordExpenses');
    expect(response.status).toBe(201);
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it('answers 403 and saves nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await POST(postRequest(GOOD_BODY));
    expect(response.status).toBe(403);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('answers 400 "Check the expense date" for a future date', async () => {
    const store = setUp();
    allow('manager');
    const response = await POST(postRequest({ ...GOOD_BODY, expenseDate: '2999-01-01' }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Check the expense date');
    expect(store.insert).not.toHaveBeenCalled();
  });
});
