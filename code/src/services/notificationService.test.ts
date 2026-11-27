/**
 * Tests for notification service operationsALL
 *
 * @author Adika Rahman
 */

import type { Notification } from '@/models';
import type { NotificationInput } from './notifier';
import {
  listMyNotifications,
  markNotificationAsRead,
  sendNotification,
  type NotificationStore,
} from './notificationService';

/** Creates a notification for testing. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    recipientId: 'user-1',
    text: 'Test notification',
    link: null,
    readAt: null,
    createdAt: new Date('2026-11-25T10:00:00.000Z'),
    ...overrides,
  };
}

/** In-memory notification store for service tests. */
class MemoryNotificationStore implements NotificationStore {
  constructor(private readonly records: Notification[] = []) {}

  async listByRecipient(recipientId: string): Promise<Notification[]> {
    return this.records.filter((record) => record.recipientId === recipientId);
  }

  async markAsRead(
    recipientId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<Notification | undefined> {
    const notification = this.records.find(
      (record) => record.id === notificationId && record.recipientId === recipientId,
    );

    if (!notification) {
      return undefined;
    }

    if (!notification.readAt) {
      notification.readAt = readAt;
    }

    return notification;
  }
}

describe('sendNotification', () => {
  it('sends the notification through the supplied notifier', async () => {
    const notifier = jest.fn().mockResolvedValue(undefined);
    const input: NotificationInput = {
      recipientId: 'user-1',
      text: 'Your ticket has been updated.',
      link: '/tickets/ticket-1',
    };

    await expect(sendNotification({ notifier }, input)).resolves.toBeUndefined();

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith(input);
  });

  it('rejects a blank recipient ID', async () => {
    const notifier = jest.fn().mockResolvedValue(undefined);

    await expect(
      sendNotification({ notifier }, { recipientId: '  ', text: 'Test message' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Recipient ID is required.',
    });

    expect(notifier).not.toHaveBeenCalled();
  });

  it('rejects a blank notification message', async () => {
    const notifier = jest.fn().mockResolvedValue(undefined);

    await expect(
      sendNotification({ notifier }, { recipientId: 'user-1', text: '   ' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Notification text is required.',
    });

    expect(notifier).not.toHaveBeenCalled();
  });

  it('passes notifier errors to the caller', async () => {
    const error = new Error('Notifier failed');
    const notifier = jest.fn().mockRejectedValue(error);

    await expect(
      sendNotification({ notifier }, { recipientId: 'user-1', text: 'Test message' }),
    ).rejects.toBe(error);
  });
});

describe('listMyNotifications', () => {
  it('returns only the recipient’s notifications, newest first', async () => {
    const older = makeNotification({
      id: 'notification-old',
      createdAt: new Date('2026-11-24T10:00:00.000Z'),
    });
    const newer = makeNotification({
      id: 'notification-new',
      createdAt: new Date('2026-11-25T10:00:00.000Z'),
    });
    const anotherUsersNotification = makeNotification({
      id: 'notification-other',
      recipientId: 'user-2',
      createdAt: new Date('2026-11-26T10:00:00.000Z'),
    });

    const store = new MemoryNotificationStore([older, anotherUsersNotification, newer]);

    const result = await listMyNotifications({ notifications: store }, 'user-1');

    expect(result.map((notification) => notification.id)).toEqual([
      'notification-new',
      'notification-old',
    ]);
    expect(result.every((notification) => notification.recipientId === 'user-1')).toBe(true);
  });

  it('returns an empty list when the recipient has no notifications', async () => {
    const store = new MemoryNotificationStore();

    await expect(listMyNotifications({ notifications: store }, 'user-1')).resolves.toEqual([]);
  });

  it('rejects a blank recipient ID', async () => {
    const store = new MemoryNotificationStore();

    await expect(listMyNotifications({ notifications: store }, '  ')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Recipient ID is required.',
    });
  });

  it('does not change the original stored array order', async () => {
    const older = makeNotification({
      id: 'notification-old',
      createdAt: new Date('2026-11-24T10:00:00.000Z'),
    });
    const newer = makeNotification({
      id: 'notification-new',
      createdAt: new Date('2026-11-25T10:00:00.000Z'),
    });
    const records = [older, newer];
    const store = new MemoryNotificationStore(records);

    await listMyNotifications({ notifications: store }, 'user-1');

    expect(records.map((notification) => notification.id)).toEqual([
      'notification-old',
      'notification-new',
    ]);
  });
});

describe('markNotificationAsRead', () => {
  it("marks the recipient's notification as read", async () => {
    const notification = makeNotification();
    const store = new MemoryNotificationStore([notification]);

    const result = await markNotificationAsRead(
      { notifications: store },
      'user-1',
      'notification-1',
    );

    expect(result.readAt).toBeInstanceOf(Date);
    expect(result.id).toBe('notification-1');
    expect(result.recipientId).toBe('user-1');
  });
  it("does not allow a recipient to mark another user's notification as read", async () => {
    const notification = makeNotification({ recipientId: 'user-2' });
    const store = new MemoryNotificationStore([notification]);

    await expect(
      markNotificationAsRead({ notifications: store }, 'user-1', 'notification-1'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Notification not found.',
    });

    expect(notification.readAt).toBeNull();
  });
  it('returns NOT_FOUND when the notification does not exist', async () => {
    const store = new MemoryNotificationStore();

    await expect(
      markNotificationAsRead({ notifications: store }, 'user-1', 'missing-notification'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Notification not found.',
    });
  });

  it('preserves the original readAt value when already read', async () => {
    const originalReadAt = new Date('2026-11-24T10:00:00.000Z');
    const notification = makeNotification({ readAt: originalReadAt });
    const store = new MemoryNotificationStore([notification]);

    const result = await markNotificationAsRead(
      { notifications: store },
      'user-1',
      'notification-1',
    );

    expect(result.readAt).toBe(originalReadAt);
  });

  it('rejects a blank recipient ID', async () => {
    const store = new MemoryNotificationStore();

    await expect(
      markNotificationAsRead({ notifications: store }, '  ', 'notification-1'),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Recipient ID is required.',
    });
  });

  it('rejects a blank notification ID', async () => {
    const store = new MemoryNotificationStore();

    await expect(
      markNotificationAsRead({ notifications: store }, 'user-1', '  '),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Notification ID is required.',
    });
  });
});
