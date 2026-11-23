/**
 * Role-check tests for `/api/rates`: the role check runs first with the right action, a refused role reaches
 * nothing, and only the committee may see or set rates (CM-01, NFR-06).
 *
 * @jest-environment node
 * @author Ayesha Siddiqa
 */
import { databaseChargeRateStore } from '@/lib/adapters/chargeRateAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { ChargeRate } from '@/models';
import type { ChargeRateStore } from '@/services/chargeRateService';
import { makeProfile } from '@/services/testFakes';
import { GET, POST } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/chargeRateAdapters', () => ({ databaseChargeRateStore: jest.fn() }));
jest.mock('@/services/auditService', () => ({
  databaseAuditWriter: jest.fn(() => jest.fn(async () => {})),
}));

const CREATED: ChargeRate = {
  id: 'rate-1',
  chargeType: 'service',
  amountPoisha: 500000,
  meetingDate: '2026-11-15',
  setBy: 'user-1',
  status: 'Current',
  createdAt: new Date('2026-11-20T00:00:00Z'),
};

function setUp() {
  const store: ChargeRateStore = {
    listCurrent: jest.fn(async () => [CREATED]),
    listAll: jest.fn(async () => [CREATED]),
    replaceCurrent: jest.fn(async () => ({ previous: null, created: CREATED })),
  };
  jest.mocked(databaseChargeRateStore).mockReturnValue(store);
  return store;
}

function allowCommittee(): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'user-1', role: 'committee' }), scope: 'all' });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/rates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for rates (NFR-06)', () => {
  it('only the committee may set rates and see the rate history', () => {
    expect(rolesFor('setChargeRates')).toEqual(['committee']);
    expect(rolesFor('viewRateHistory')).toEqual(['committee']);
  });
});

describe('GET /api/rates', () => {
  it('checks viewRateHistory first and returns current rates and history', async () => {
    const store = setUp();
    allowCommittee();
    const response = await GET(new Request('http://localhost/api/rates'));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'viewRateHistory');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { current: unknown[]; history: unknown[] };
    expect(body.current).toHaveLength(1);
    expect(body.history).toHaveLength(1);
    expect(store.listCurrent).toHaveBeenCalled();
  });

  it('answers 403 and reads nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await GET(new Request('http://localhost/api/rates'));

    expect(response.status).toBe(403);
    expect(store.listCurrent).not.toHaveBeenCalled();
    expect(store.listAll).not.toHaveBeenCalled();
  });
});

describe('POST /api/rates', () => {
  it('checks setChargeRates first and saves the rate', async () => {
    const store = setUp();
    allowCommittee();
    const response = await POST(
      postRequest({ chargeType: 'service', amountPoisha: 500000, meetingDate: '2026-11-15' }),
    );

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'setChargeRates');
    expect(response.status).toBe(201);
    expect(store.replaceCurrent).toHaveBeenCalledTimes(1);
  });

  it('answers 403 and saves nothing when the role is refused', async () => {
    const store = setUp();
    refuse();
    const response = await POST(
      postRequest({ chargeType: 'service', amountPoisha: 500000, meetingDate: '2026-11-15' }),
    );

    expect(response.status).toBe(403);
    expect(store.replaceCurrent).not.toHaveBeenCalled();
  });

  it('answers 400 with the SRS message for a blank rate', async () => {
    const store = setUp();
    allowCommittee();
    const response = await POST(postRequest({ chargeType: 'water', meetingDate: '2026-11-15' }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Enter a valid rate and meeting date');
    expect(store.replaceCurrent).not.toHaveBeenCalled();
  });

  it('answers 400 with the SRS message for an unknown charge type', async () => {
    setUp();
    allowCommittee();
    const response = await POST(
      postRequest({ chargeType: 'gas', amountPoisha: 100, meetingDate: '2026-11-15' }),
    );
    expect(response.status).toBe(400);
  });
});
