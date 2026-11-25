/**
 * Role-check tests for `/api/overpayments` and `/api/overpayments/[id]/refund`: only the manager may list or refund,
 * the role check runs first, a refused request reads or changes nothing, and a bad id is a 404 (BM-04, NFR-06).
 *
 * @jest-environment node
 * @author Mahir Al Kamal
 */
import { databaseOverpaymentStore } from '@/lib/adapters/overpaymentAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE, rolesFor } from '@/lib/permissions';
import type { OverpaymentStore } from '@/services/overpaymentService';
import { makeProfile } from '@/services/testFakes';
import { POST } from './[id]/refund/route';
import { GET } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/overpaymentAdapters', () => ({ databaseOverpaymentStore: jest.fn() }));
jest.mock('@/services/auditService', () => ({
  databaseAuditWriter: jest.fn(() => jest.fn(async () => {})),
}));

const ID = '7d3f0b9a-1c2e-4f5a-8b6c-9d0e1f2a3b4c';

function setUp(): OverpaymentStore {
  const store: OverpaymentStore = {
    list: jest.fn(async () => []),
    findStatus: jest.fn(async () => 'Flagged' as const),
    markRefunded: jest.fn(async () => true),
  };
  jest.mocked(databaseOverpaymentStore).mockReturnValue(store);
  return store;
}

function allowManager(): void {
  jest
    .mocked(requireRole)
    .mockResolvedValue({ actor: makeProfile({ id: 'manager-1', role: 'manager' }), scope: 'all' });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

const refund = (id: string) =>
  POST(new Request(`http://localhost/api/overpayments/${id}/refund`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions for overpayments (NFR-06)', () => {
  it('only the manager may list and refund them', () => {
    expect(rolesFor('decidePaymentClaims')).toEqual(['manager']);
  });
});

describe('GET /api/overpayments', () => {
  it('checks decidePaymentClaims first and returns the list', async () => {
    const store = setUp();
    allowManager();
    const response = await GET(new Request('http://localhost/api/overpayments'));

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'decidePaymentClaims');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ overpayments: [] });
    expect(store.list).toHaveBeenCalled();
  });

  it('answers 403 and reads nothing for any other role', async () => {
    const store = setUp();
    refuse();
    const response = await GET(new Request('http://localhost/api/overpayments'));
    expect(response.status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/overpayments/[id]/refund', () => {
  it('checks decidePaymentClaims first and marks it Refunded', async () => {
    const store = setUp();
    allowManager();
    const response = await refund(ID);

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'decidePaymentClaims');
    expect(response.status).toBe(204);
    expect(store.markRefunded).toHaveBeenCalledWith(ID, 'manager-1', expect.any(Date));
  });

  it('answers 403 and changes nothing for any other role', async () => {
    const store = setUp();
    refuse();
    const response = await refund(ID);
    expect(response.status).toBe(403);
    expect(store.markRefunded).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a UUID (invalid input)', async () => {
    const store = setUp();
    allowManager();
    const response = await refund('not-an-id');
    expect(response.status).toBe(404);
    expect(store.findStatus).not.toHaveBeenCalled();
  });

  it('answers 409 when it is already Refunded', async () => {
    const store = setUp();
    jest.mocked(store.findStatus).mockResolvedValue('Refunded');
    allowManager();
    const response = await refund(ID);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('This overpayment is already marked Refunded.');
  });
});
