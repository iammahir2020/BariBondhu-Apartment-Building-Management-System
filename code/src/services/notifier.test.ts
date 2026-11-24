/**
 * Tests for the shared notifier interface and its no-op implementation.
 *
 * @author Adika Rahman
 */
import { noopNotifier } from './notifier';

describe('noopNotifier', () => {
  it('resolves without an error when given a notification', async () => {
    await expect(
      noopNotifier({
        recipientId: '00000000-0000-0000-0000-000000000001',
        text: 'Test notification',
        link: '/notifications',
      }),
    ).resolves.toBeUndefined();
  });
});
