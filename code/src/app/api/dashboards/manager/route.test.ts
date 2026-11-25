/**
 * Role-check tests for `/api/dashboards/manager`: only the manager gets the counts, the role check runs first, and a
 * refused or signed-out request reads nothing (BM-01, NFR-06).
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { databaseManagerHomeStore } from '@/lib/adapters/managerHomeAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { ManagerHomeStore } from '@/services/managerHomeService';
import { makeProfile } from '@/services/testFakes';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/managerHomeAdapters', () => ({ databaseManagerHomeStore: jest.fn() }));

function setUp(): ManagerHomeStore {
  const store: ManagerHomeStore = {
    latestMonthBills: jest.fn(async () => [
      { billingMonth: '2026-11-01', totalPoisha: 485000, status: 'Unpaid' as const },
    ]),
    openTickets: jest.fn(async () => []),
    waitingExpenses: jest.fn(async () => [{ amountPoisha: 1850000 }]),
    flaggedOverpayments: jest.fn(async () => []),
  };
  jest.mocked(databaseManagerHomeStore).mockReturnValue(store);
  return store;
}

const request = () => new Request('http://localhost/api/dashboards/manager');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for the manager home (NFR-06)', () => {
  it('only the manager may see it', () => {
    expect(rolesFor('viewManagerDashboard')).toEqual(['manager']);
  });
});

describe('GET /api/dashboards/manager', () => {
  it('checks viewManagerDashboard first and returns the counts', async () => {
    setUp();
    jest.mocked(requireRole).mockResolvedValue({
      actor: makeProfile({ id: 'manager-1', role: 'manager' }),
      scope: 'all',
    });
    const response = await GET(request());

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewManagerDashboard');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      bills: { billed: number };
      waitingExpenses: { count: number };
    };
    expect(body.bills.billed).toBe(1);
    expect(body.waitingExpenses.count).toBe(1);
  });

  it('answers 403 and reads nothing for any other role', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(store.latestMonthBills).not.toHaveBeenCalled();
  });

  it('answers 401 and reads nothing when signed out', async () => {
    const store = setUp();
    jest.mocked(requireRole).mockRejectedValue(new AppError('UNAUTHORIZED', 'Log in to continue.'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(store.openTickets).not.toHaveBeenCalled();
  });
});
