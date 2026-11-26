/**
 * Tests for database-backed in-app notification delivery.
 *
 * @author Jannatul Ferdus Nishi
 */
import type { Database } from '@/lib/db';
import { notifications } from '@/models/Notification';
import { databaseNotifier } from './notificationAdapters';

describe('databaseNotifier', () => {
  it('persists recipient, text, and optional destination', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn(() => ({ values }));
    const db = { insert } as unknown as Database;
    const notify = databaseNotifier(db);

    await notify({
      recipientId: 'profile-1',
      text: 'A ticket was assigned.',
      link: '/maintenance',
    });

    expect(insert).toHaveBeenCalledWith(notifications);
    expect(values).toHaveBeenCalledWith({
      recipientId: 'profile-1',
      text: 'A ticket was assigned.',
      link: '/maintenance',
    });
  });

  it('stores a missing link as null and propagates database failures', async () => {
    const values = jest.fn().mockRejectedValue(new Error('Notification insert failed'));
    const insert = jest.fn(() => ({ values }));
    const notify = databaseNotifier({ insert } as unknown as Database);

    await expect(
      notify({ recipientId: 'profile-1', text: 'A ticket was closed.' }),
    ).rejects.toThrow('Notification insert failed');
    expect(values).toHaveBeenCalledWith({
      recipientId: 'profile-1',
      text: 'A ticket was closed.',
      link: null,
    });
  });
});
