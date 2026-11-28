/**
 * @jest-environment jsdom
 */

/**
 * BB-2305: Notification bell tests.
 *
 * @author Adika Rahman
 */

import { render, screen } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';

const mockCallApi: jest.Mock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  callApi: (url: string, method: string) => mockCallApi(url, method),
}));

describe('BB-2305 Notification Bell', () => {
  beforeEach(() => {
    mockCallApi.mockReset();
  });

  it('shows the notification bell with no unread count', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        notifications: [],
      },
    });

    render(<NotificationBell />);

    expect(
      await screen.findByRole('link', {
        name: 'Notifications, 0 unread',
      }),
    ).toBeInTheDocument();
  });

  it('shows the unread notification count', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        notifications: [
          { id: '1', readAt: null },
          { id: '2', readAt: null },
          { id: '3', readAt: '2026-11-28T10:00:00Z' },
        ],
      },
    });

    render(<NotificationBell />);

    expect(
      await screen.findByRole('link', {
        name: 'Notifications, 2 unread',
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('limits the displayed count to 99+', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        notifications: Array.from({ length: 101 }, (_, index) => ({
          id: String(index),
          readAt: null,
        })),
      },
    });

    render(<NotificationBell />);

    expect(
      await screen.findByRole('link', {
        name: 'Notifications, 101 unread',
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('does not show a count when the API request fails', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      status: 500,
      error: {
        code: 'INTERNAL',
        message: 'Could not load notifications',
      },
    });

    render(<NotificationBell />);

    expect(
      screen.getByRole('link', {
        name: 'Notifications, 0 unread',
      }),
    ).toBeInTheDocument();
  });
});
