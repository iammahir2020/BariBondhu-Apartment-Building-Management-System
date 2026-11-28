/**
 * @jest-environment jsdom
 */

/**
 * BB-0509: Manager Bills Page Tests.
 *
 * Tests bill listing, filtering, generation,
 * correction and API error handling.
 *
 * @author Jannatul Ferdus Nishi
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ManagerBillsPage from './page';

const mockCallApi: jest.Mock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  callApi: (url: string, method: string, body?: unknown) => mockCallApi(url, method, body),
}));

const bills = [
  {
    id: '123e4567-e89b-42d3-a456-426614174001',
    flatId: 'flat-1',
    occupancyId: 'occupancy-1',
    flatNumber: '101',
    householdName: 'Family A',
    billingMonth: '2026-12-01',
    dueDate: '2026-12-20',
    totalPoisha: 150000,
    status: 'Unpaid',
  },
  {
    id: '123e4567-e89b-42d3-a456-426614174002',
    flatId: 'flat-2',
    occupancyId: 'occupancy-2',
    flatNumber: '102',
    householdName: 'Family B',
    billingMonth: '2026-12-01',
    dueDate: '2026-12-20',
    totalPoisha: 200000,
    status: 'Paid',
  },
];

describe('BB-0509 Manager Bills Page', () => {
  beforeEach(() => {
    mockCallApi.mockReset();

    mockCallApi.mockImplementation(async (_url: string, method: string) => {
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          data: { bills },
        };
      }

      return {
        ok: true,
        status: 201,
        data: {},
      };
    });

    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads and displays monthly bills', async () => {
    render(<ManagerBillsPage />);

    expect(await screen.findByText('Family A')).toBeInTheDocument();
    expect(screen.getByText('Family B')).toBeInTheDocument();

    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();

    expect(mockCallApi).toHaveBeenCalledWith('/api/manager/bills', 'GET', undefined);
  });

  it('shows the block with the flat so the same flat number in two blocks can be told apart', async () => {
    mockCallApi.mockImplementation(async () => ({
      ok: true,
      status: 200,
      data: {
        bills: [
          { ...bills[0], flatNumber: '3B', blockName: 'A' },
          { ...bills[1], flatNumber: '3B', blockName: 'B' },
        ],
      },
    }));

    render(<ManagerBillsPage />);

    expect(await screen.findByText('A-3B')).toBeInTheDocument();
    expect(screen.getByText('B-3B')).toBeInTheDocument();
  });

  it('filters bills by payment status', async () => {
    const user = userEvent.setup();

    render(<ManagerBillsPage />);

    await screen.findByText('Family A');

    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Filter by status',
      }),
      'Paid',
    );

    expect(screen.getByText('Family B')).toBeInTheDocument();
    expect(screen.queryByText('Family A')).not.toBeInTheDocument();
  });

  it('generates monthly bills using the API', async () => {
    const user = userEvent.setup();

    render(<ManagerBillsPage />);

    await screen.findByText('Family A');

    await user.click(
      screen.getByRole('button', {
        name: 'Generate bills',
      }),
    );

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/manager/bills',
        'POST',
        expect.objectContaining({
          billingMonth: expect.stringMatching(/^\d{4}-\d{2}-01$/),
          dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    expect(await screen.findByText('Monthly bills generated successfully.')).toBeInTheDocument();
  });

  it('corrects an unpaid bill with a reason', async () => {
    const user = userEvent.setup();

    render(<ManagerBillsPage />);

    await screen.findByText('Family A');

    await user.click(
      screen.getByRole('button', {
        name: 'Correct',
      }),
    );

    await user.type(screen.getByLabelText(/^Adjustment amount/), '-500');

    await user.type(screen.getByLabelText('Reason for correction'), 'Incorrect generator charge');

    await user.click(
      screen.getByRole('button', {
        name: 'Save correction',
      }),
    );

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith(
        `/api/manager/bills/${bills[0]!.id}/correct`,
        'POST',
        {
          adjustmentPoisha: -50000,
          reason: 'Incorrect generator charge',
        },
      );
    });

    expect(await screen.findByText('Bill corrected successfully.')).toBeInTheDocument();
  });

  it('rejects an invalid correction amount', async () => {
    const user = userEvent.setup();

    render(<ManagerBillsPage />);

    await screen.findByText('Family A');

    await user.click(
      screen.getByRole('button', {
        name: 'Correct',
      }),
    );

    await user.type(screen.getByLabelText(/^Adjustment amount/), '0');

    await user.type(screen.getByLabelText('Reason for correction'), 'Testing invalid amount');

    await user.click(
      screen.getByRole('button', {
        name: 'Save correction',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a non-zero adjustment amount.',
    );

    const correctionCalls = mockCallApi.mock.calls.filter(([url]) =>
      String(url).endsWith('/correct'),
    );

    expect(correctionCalls).toHaveLength(0);
  });

  it('displays an API error when bills cannot load', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      status: 500,
      error: {
        code: 'INTERNAL',
        message: 'Could not load bills',
      },
    });

    render(<ManagerBillsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load bills');
  });
});
