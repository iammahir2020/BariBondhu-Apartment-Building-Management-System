/**
 * @jest-environment jsdom
 */

/**
 * BB-2007: Manager Emergency Numbers Page Tests.
 *
 * Tests loading, editing and saving building emergency numbers.
 *
 * @author Adika Rahman
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ManagerEmergencyPage from './page';

const mockCallApi: jest.Mock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  callApi: (url: string, method: string, body?: unknown) => mockCallApi(url, method, body),
}));

const numbers = [
  { label: 'Guard desk', phone: '01700000111' },
  { label: 'Manager', phone: '01700000222' },
];

describe('BB-2007 Manager Emergency Numbers Page', () => {
  beforeEach(() => {
    mockCallApi.mockReset();

    mockCallApi.mockImplementation(async (_url: string, method: string) => {
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          data: { numbers },
        };
      }

      return {
        ok: true,
        status: 200,
        data: {
          number: { label: 'Guard desk', phone: '01800000111' },
        },
      };
    });
  });

  it('loads and displays emergency numbers', async () => {
    render(<ManagerEmergencyPage />);

    expect(await screen.findByDisplayValue('01700000111')).toBeInTheDocument();
    expect(screen.getByDisplayValue('01700000222')).toBeInTheDocument();
    expect(screen.getByText('999')).toBeInTheDocument();

    expect(mockCallApi).toHaveBeenCalledWith('/api/emergency-contacts', 'GET', undefined);
  });

  it('updates the Guard desk number', async () => {
    const user = userEvent.setup();

    render(<ManagerEmergencyPage />);

    const guardInput = await screen.findByLabelText('Guard desk');

    await user.clear(guardInput);
    await user.type(guardInput, '01800000111');

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/api/emergency-contacts', 'PATCH', {
        label: 'Guard desk',
        phone: '01800000111',
      });
    });

    expect(await screen.findByText('Guard desk number updated successfully.')).toBeInTheDocument();
  });

  it('keeps the national emergency number fixed', async () => {
    render(<ManagerEmergencyPage />);

    expect(await screen.findByText('999')).toBeInTheDocument();

    expect(screen.getByText('Fixed number. It cannot be edited.')).toBeInTheDocument();
  });

  it('displays an API error when numbers cannot load', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      status: 500,
      error: {
        code: 'INTERNAL',
        message: 'Could not load emergency numbers',
      },
    });

    render(<ManagerEmergencyPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load emergency numbers');
  });
});
