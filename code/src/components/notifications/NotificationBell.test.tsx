/**
 * @jest-environment jsdom
 */
/**
 * Tests for the top bar's notifications bell (BB-2304): the unread badge, the panel, marking one read when it is
 * opened, and the empty and error states.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetch, answerFetchByRoute } from '@/components/auth/testFetch';
import { NotificationBell } from './NotificationBell';
import type { NotificationView } from './notificationView';

const UNREAD: NotificationView = {
  id: 'n-1',
  text: 'Your ticket "Kitchen tap" is now In progress.',
  link: '/resident/tickets',
  readAt: null,
  createdAt: '2026-11-28T12:56:00.000Z',
};
const READ: NotificationView = {
  id: 'n-2',
  text: 'Your bill for November is ready.',
  link: null,
  readAt: '2026-11-27T10:00:00.000Z',
  createdAt: '2026-11-27T09:00:00.000Z',
};

describe('NotificationBell', () => {
  it('shows the unread count on the bell', async () => {
    answerFetch(200, { notifications: [UNREAD, READ] });
    render(<NotificationBell />);
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('lists the notifications with their time when opened', async () => {
    const user = userEvent.setup();
    answerFetch(200, { notifications: [UNREAD, READ] });
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));

    expect(await screen.findByRole('link', { name: /Kitchen tap/ })).toHaveAttribute(
      'href',
      '/resident/tickets',
    );
    expect(screen.getByText(/November is ready/)).toBeInTheDocument();
    expect(screen.getByText('28 Nov, 6:56 pm')).toBeInTheDocument();
  });

  it('marks a notification read when it is opened, and clears the badge', async () => {
    const user = userEvent.setup();
    const fetchMock = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/notifications/mine',
        status: 200,
        body: { notifications: [UNREAD] },
      },
      { method: 'PATCH', url: '/api/notifications/*', status: 200, body: { notification: UNREAD } },
    ]);
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(await screen.findByRole('link', { name: /Kitchen tap/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/n-1/read',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('does not call the server again for one that is already read (boundary)', async () => {
    const user = userEvent.setup();
    const fetchMock = answerFetch(200, { notifications: [READ] });
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: /November is ready/ }));
    expect(
      fetchMock.mock.calls.every(([, init]) => (init as RequestInit)?.method !== 'PATCH'),
    ).toBe(true);
  });

  it('says there are none yet when the list is empty (boundary)', async () => {
    const user = userEvent.setup();
    answerFetch(200, { notifications: [] });
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });

  it('shows the error in the panel when the list fails (exception)', async () => {
    const user = userEvent.setup();
    answerFetch(500, { error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } });
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });
});
