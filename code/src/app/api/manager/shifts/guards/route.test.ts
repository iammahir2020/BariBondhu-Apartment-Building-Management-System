import { GET } from './route';

import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';

jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/models', () => ({
  profiles: {
    id: 'id',
    displayName: 'displayName',
    role: 'role',
    active: 'active',
  },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conditions) => conditions),
  eq: jest.fn((column, value) => ({ column, value })),
}));

const mockRequireRole = jest.mocked(requireRole);
const mockSelect = jest.mocked(db.select);

describe('GET /api/manager/shifts/guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireRole.mockResolvedValue({
      id: 'manager-1',
      role: 'manager',
    } as never);
  });

  it('returns active guards for an authorised manager', async () => {
    const guards = [
      { id: 'guard-1', displayName: 'Babul' },
      { id: 'guard-2', displayName: 'Hanif' },
    ];

    const orderBy = jest.fn().mockResolvedValue(guards);
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });

    mockSelect.mockReturnValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/manager/shifts/guards'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ guards });
    expect(mockRequireRole).toHaveBeenCalledWith(expect.any(Request), 'planShifts');
  });

  it('returns an error when the manager is not authorised', async () => {
    mockRequireRole.mockRejectedValue(new AppError('FORBIDDEN', "You don't have access to this."));

    const response = await GET(new Request('http://localhost/api/manager/shifts/guards'));

    expect(response.status).toBe(403);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns an error when the database query fails', async () => {
    const orderBy = jest.fn().mockRejectedValue(new Error('Database error'));
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });

    mockSelect.mockReturnValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/manager/shifts/guards'));

    expect(response.status).toBe(500);
  });
});
