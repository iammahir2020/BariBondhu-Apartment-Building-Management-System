/**
 * Role-check tests for PATCH /api/notifications/[id]/read (BB-2304, NFR-06).
 *
 * @jest-environment node
 * @author Adika Rahman
 */
import { databaseNotificationStore } from '@/lib/adapters/notificationAdapters';
import { requireRole } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { FORBIDDEN_MESSAGE } from '@/lib/permissions';
import type { Notification } from '@/models';
import type { NotificationStore } from '@/services/notificationService';
import { makeProfile } from '@/services/testFakes';
import { PATCH } from './route';

jest.mock('@/lib/auth', () => ({ requireRole: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/adapters/notificationAdapters', () => ({
  databaseNotificationStore: jest.fn(),
}));

const SAVED: Notification = {
  id: '00000000-0000-4000-8000-000000000001',
  recipientId: 'user-1',
  text: 'Your maintenance ticket was updated.',
  link: '/maintenance',
  readAt: new Date('2026-11-26T09:00:00Z'),
  createdAt: new Date('2026-11-20T00:00:00Z'),
};

function setUp() {
  const store: NotificationStore = {
    listByRecipient: jest.fn(async () => [SAVED]),
    markAsRead: jest.fn(async () => SAVED),
  };
  jest.mocked(databaseNotificationStore).mockReturnValue(store);
  return store;
}

function allow(): void {
  jest.mocked(requireRole).mockResolvedValue({
    actor: makeProfile({ id: 'user-1', role: 'manager' }),
    scope: 'own',
  });
}

function refuse(): void {
  jest.mocked(requireRole).mockRejectedValue(new AppError('FORBIDDEN', FORBIDDEN_MESSAGE));
}

function patch(): Promise<Response> {
  return PATCH(
    new Request('http://localhost/api/notifications/00000000-0000-4000-8000-000000000001/read', {
      method: 'PATCH',
    }),
    {
      params: Promise.resolve({
        id: '00000000-0000-4000-8000-000000000001',
      }),
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /api/notifications/[id]/read', () => {
  it('checks readNotifications first and marks the notification as read', async () => {
    const store = setUp();
    allow();

    const response = await patch();

    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), 'readNotifications');
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      notification: Notification;
    };

    expect(body.notification).toEqual(JSON.parse(JSON.stringify(SAVED)));
    expect(store.markAsRead).toHaveBeenCalledWith(
      'user-1',
      '00000000-0000-4000-8000-000000000001',
      expect.any(Date),
    );
  });

  it('answers 403 and updates nothing when the role is refused', async () => {
    const store = setUp();
    refuse();

    const response = await patch();

    expect(response.status).toBe(403);
    expect(store.markAsRead).not.toHaveBeenCalled();
  });
});
