/**
 * @jest-environment jsdom
 */

/**
 * BB-2305: Notifications page tests.
 *
 * @author Adika Rahman
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPage from './page';

const mockCallApi: jest.Mock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  callApi: (url: string, method: string) => mockCallApi(url, method),
}));

const notifications = [
  {
    id: 'notification-1',
    text: 'Your maintenance request has been updated.',
    link: '/resident/maintenance',
    readAt: null,
    createdAt: '2026-11-28T10:00:00Z',
  },
  {
    id: 'notification-2',
    text: 'Your monthly bill is ready.',
    link: null,
    readAt: '2026-11-27T10:00:00Z',
    createdAt: '2026-11-27T10:00:00Z',
  },
];

describe('BB-2305 Notifications Page', () => {
  beforeEach(() => {
    mockCallApi.mockReset();

    mockCallApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { notifications },
    });
  });

  it('loads and displays notifications', async () => {
    render(<NotificationsPage />);

    expect(
      await screen.findByText('Your maintenance request has been updated.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Your monthly bill is ready.')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();

    expect(mockCallApi).toHaveBeenCalledWith('/api/notifications/mine', 'GET');
  });

  it('shows an empty message when there are no notifications', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { notifications: [] },
    });

    render(<NotificationsPage />);

    expect(await screen.findByText('You have no notifications.')).toBeInTheDocument();

    expect(screen.getByText('0 unread')).toBeInTheDocument();
  });

  it('marks an unread notification as read', async () => {
    const user = userEvent.setup();
    let loadCount = 0;

    mockCallApi.mockImplementation(async (url: string, method: string) => {
      if (method === 'PATCH') {
        return { ok: true, status: 200, data: {} };
      }

      loadCount += 1;

      return {
        ok: true,
        status: 200,
        data: {
          notifications:
            loadCount === 1
              ? notifications
              : notifications.map((item) =>
                  item.id === 'notification-1' ? { ...item, readAt: '2026-11-28T12:00:00Z' } : item,
                ),
        },
      };
    });

    render(<NotificationsPage />);

    await screen.findByText('Your maintenance request has been updated.');

    await user.click(screen.getByRole('button', { name: 'Mark as read' }));

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/api/notifications/notification-1/read', 'PATCH');
    });

    expect(await screen.findByText('0 unread')).toBeInTheDocument();
  });

  it('shows an API error when notifications cannot load', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      status: 500,
      error: {
        code: 'INTERNAL',
        message: 'Could not load notifications',
      },
    });

    render(<NotificationsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load notifications');
  });

  it('shows a link when a notification has a destination', async () => {
    render(<NotificationsPage />);

    const link = await screen.findByRole('link', { name: 'View details' });

    expect(link).toHaveAttribute('href', '/resident/maintenance');
  });
});
