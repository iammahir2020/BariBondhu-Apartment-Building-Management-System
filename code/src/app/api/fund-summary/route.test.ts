/**
 * Role-check tests for `/api/fund-summary`: the role check runs first with the right action, a refused role reaches
 * nothing, residents see only published summaries, and a month that has not ended is refused with the SRS message
 * (BM-12, RES-05, NFR-06).
 *
 * @jest-environment node
 * @author Ayesha Siddiqa
 */
import {
  databaseFundFigureStore,
  databaseFundSummaryStore,
  databaseOpeningBalanceStore,
} from '@/lib/adapters/fundAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { FundSummary } from '@/models';
import type { FundSummaryStore } from '@/services/fundPublishService';
import { makeProfile } from '@/services/testFakes';
import { GET, POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/fundAdapters', () => ({
  databaseFundFigureStore: jest.fn(),
  databaseFundSummaryStore: jest.fn(),
  databaseOpeningBalanceStore: jest.fn(),
}));
jest.mock('@/services/auditService', () => ({
  databaseAuditWriter: jest.fn(() => jest.fn(async () => {})),
}));

function summary(month: string, status: FundSummary['status']): FundSummary {
  const at = new Date('2026-11-01T00:00:00Z');
  return {
    id: `summary-${month}`,
    month,
    openingBalancePoisha: 0,
    totalCollectedPoisha: 0,
    spentRepairPoisha: 0,
    spentSalaryPoisha: 0,
    spentUtilityPoisha: 0,
    spentOtherPoisha: 0,
    closingBalancePoisha: 0,
    totalOutstandingPoisha: 0,
    status,
    publishedBy: null,
    publishedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function setUp() {
  const store: FundSummaryStore = {
    findByMonth: jest.fn(async () => undefined),
    insert: jest.fn(async () => summary('2026-10-01', 'Published')),
    update: jest.fn(async () => summary('2026-10-01', 'Published')),
    list: jest.fn(async () => [summary('2026-10-01', 'Published'), summary('2026-11-01', 'Draft')]),
  };
  jest.mocked(databaseFundSummaryStore).mockReturnValue(store);
  jest.mocked(databaseFundFigureStore).mockReturnValue({
    listConfirmedPayments: jest.fn(async () => []),
    listExpensesDated: jest.fn(async () => []),
    listBillsOfMonth: jest.fn(async () => []),
    findSummaryByMonth: jest.fn(async () => undefined),
  });
  jest.mocked(databaseOpeningBalanceStore).mockReturnValue({
    findById: jest.fn(async () => undefined),
    findByMonth: jest.fn(async () => undefined),
    insert: jest.fn(),
    update: jest.fn(),
    list: jest.fn(async () => []),
  });
  return store;
}

function allow(role: 'resident' | 'manager' | 'committee'): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'user-1', role }), scope: 'all' });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/fund-summary', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for the fund summary (NFR-06)', () => {
  it('only the manager publishes; residents, manager and committee see it', () => {
    expect(rolesFor('publishFundSummary')).toEqual(['manager']);
    expect(rolesFor('viewFundSummary')).toEqual(['resident', 'manager', 'committee']);
  });
});

describe('GET /api/fund-summary', () => {
  it('checks viewFundSummary first and returns only published months (RES-05 c3)', async () => {
    setUp();
    allow('resident');
    const response = await GET(new Request('http://localhost/api/fund-summary'));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewFundSummary');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { summaries: { month: string }[] };
    expect(body.summaries.map((row) => row.month)).toEqual(['2026-10-01']);
  });

  it('answers 403 and reads nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await GET(new Request('http://localhost/api/fund-summary'));
    expect(response.status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/fund-summary', () => {
  it('answers 403 and saves nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await POST(postRequest({ month: '2026-10-01' }));
    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'publishFundSummary');
    expect(response.status).toBe(403);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('answers 400 "Check the month" for a month that is not valid', async () => {
    const store = setUp();
    allow('manager');
    const response = await POST(postRequest({ month: 'October' }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Check the month');
    expect(store.insert).not.toHaveBeenCalled();
  });
});
