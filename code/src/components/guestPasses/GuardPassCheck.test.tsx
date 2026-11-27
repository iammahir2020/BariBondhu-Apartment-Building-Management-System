/**
 * @jest-environment jsdom
 */

/**
 * Tests for the guard guest pass checking screen.
 * BB-1706, BB-1707, SG-02 and SG-03.
 *
 * @author Tawhid Bin Moslim
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuardPassCheck } from './GuardPassCheck';

const VALID_PASS = {
  passId: 'pass-1',
  guestName: 'Rahim Hasan',
  flat: 'A-101',
  approvedGuestCount: 4,
  remainingGuestCount: 3,
  status: 'Partly used',
  checkInAllowed: true,
  reason: null,
  validFrom: null,
  // The UI must never display resident contact information.
  residentPhone: '01700000000',
};

/** One answer returned by the mocked fetch. */
interface Answer {
  status: number;
  body: unknown;
}

/** Makes fetch return the supplied answers in order. */
function answers(...list: Answer[]): jest.Mock {
  let index = 0;

  const mock = jest.fn(async () => {
    const answer = list[Math.min(index, list.length - 1)] as Answer;
    index += 1;

    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => JSON.stringify(answer.body),
    };
  });

  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Makes fetch reject to simulate a device with no server connection. */
function networkFailure(): jest.Mock {
  const mock = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('GuardPassCheck', () => {
  it('checks a valid pass and displays its details without resident phone information', async () => {
    const user = userEvent.setup();
    const fetchMock = answers({
      status: 200,
      body: VALID_PASS,
    });

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByRole('heading', { name: 'Pass details' })).toBeInTheDocument();
    expect(screen.getByText('Rahim Hasan')).toBeInTheDocument();
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.getByText('4', { selector: 'p.font-semibold' })).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'p.font-semibold' })).toBeInTheDocument();
    expect(screen.getByText('Partly used')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Confirm guest entry' })).toBeInTheDocument();
    expect(screen.queryByText('01700000000')).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/guard/guest-passes/check',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      }),
    );
  });

  it.each([
    ['Expired', 'Expired', null],
    ['Cancelled', 'Cancelled', null],
    ['not yet valid', 'Valid from', '2026-11-28T10:00:00.000Z'],
  ])(
    'shows the invalid reason for a %s pass and refuses check-in',
    async (_label, reason, validFrom) => {
      const user = userEvent.setup();

      answers({
        status: 200,
        body: {
          ...VALID_PASS,
          status: reason === 'Valid from' ? 'Scheduled' : reason,
          checkInAllowed: false,
          reason,
          validFrom,
        },
      });

      render(<GuardPassCheck />);

      await user.type(screen.getByLabelText('Guest pass code'), '123456');
      await user.click(screen.getByRole('button', { name: 'Check pass' }));

      expect(await screen.findByText('Pass not valid')).toBeInTheDocument();

      if (reason === 'Valid from') {
        expect(screen.getByText(/Valid from:/)).toBeInTheDocument();
      } else {
        expect(screen.getByText(`Reason: ${reason}`)).toBeInTheDocument();
      }

      expect(screen.queryByRole('button', { name: 'Confirm guest entry' })).not.toBeInTheDocument();
    },
  );

  it('shows Fully used and does not offer check-in', async () => {
    const user = userEvent.setup();

    answers({
      status: 200,
      body: {
        ...VALID_PASS,
        remainingGuestCount: 0,
        status: 'Fully used',
        checkInAllowed: false,
        reason: 'Fully used',
      },
    });

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Fully used')).toBeInTheDocument();
    expect(screen.getByText('Reason: Fully used')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm guest entry' })).not.toBeInTheDocument();
  });

  it('shows the API message when no pass matches the code', async () => {
    const user = userEvent.setup();

    answers({
      status: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'No pass with this code',
        },
      },
    });

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pass with this code');
    expect(screen.queryByRole('heading', { name: 'Pass details' })).not.toBeInTheDocument();
  });

  it('shows the offline message when pass checking takes longer than five seconds', async () => {
    jest.useFakeTimers();

    try {
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;

      render(<GuardPassCheck />);

      await user.type(screen.getByLabelText('Guest pass code'), '123456');
      await user.click(screen.getByRole('button', { name: 'Check pass' }));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'No connection: use the intercom and paper register',
      );

      expect(screen.queryByRole('heading', { name: 'Pass details' })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
  it('shows the required offline message when pass checking cannot reach the server', async () => {
    const user = userEvent.setup();
    networkFailure();

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No connection: use the intercom and paper register',
    );

    expect(screen.queryByRole('heading', { name: 'Pass details' })).not.toBeInTheDocument();
    expect(screen.queryByText(/successfully/)).not.toBeInTheDocument();
  });

  it('records guest entry using the pass ID and updates the remaining allowance', async () => {
    const user = userEvent.setup();

    const fetchMock = answers(
      {
        status: 200,
        body: VALID_PASS,
      },
      {
        status: 200,
        body: {
          visit: { id: 'visit-1' },
          remainingGuestCount: 1,
        },
      },
    );

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Rahim Hasan')).toBeInTheDocument();

    const guestCountInput = screen.getByLabelText('Number of guests arriving');
    await user.clear(guestCountInput);
    await user.type(guestCountInput, '2');

    await user.click(screen.getByRole('button', { name: 'Confirm guest entry' }));

    expect(
      await screen.findByText('2 guests have been checked in successfully.'),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/guard/guest-passes/entry',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          passId: 'pass-1',
          guestsIn: 2,
        }),
      }),
    );

    expect(screen.getByText('1', { selector: 'p.font-semibold' })).toBeInTheDocument();
    expect(screen.getByText('Partly used')).toBeInTheDocument();
  });

  it('submits a paper-register entry with the actual arrival time and Entered later flag', async () => {
    const user = userEvent.setup();

    const fetchMock = answers(
      {
        status: 200,
        body: VALID_PASS,
      },
      {
        status: 200,
        body: {
          visit: { id: 'visit-2' },
          remainingGuestCount: 2,
        },
      },
    );

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Rahim Hasan')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Entered later (paper register)'));

    const actualArrivalInput = screen.getByLabelText('Actual arrival date and time');
    await user.type(actualArrivalInput, '2026-11-27T20:15');

    await user.click(screen.getByRole('button', { name: 'Confirm guest entry' }));

    expect(
      await screen.findByText('1 guest has been recorded as Entered later.'),
    ).toBeInTheDocument();

    const submittedBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/guard/guest-passes/entry',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    expect(submittedBody).toEqual({
      passId: 'pass-1',
      guestsIn: 1,
      enteredLater: true,
      enteredAt: new Date('2026-11-27T20:15').toISOString(),
    });

    expect(screen.queryByLabelText('Actual arrival date and time')).not.toBeInTheDocument();
  });

  it('requires an actual arrival date and time for a paper-register entry', async () => {
    const user = userEvent.setup();

    answers({
      status: 200,
      body: VALID_PASS,
    });

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Rahim Hasan')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Entered later (paper register)'));

    expect(screen.getByRole('button', { name: 'Confirm guest entry' })).toBeDisabled();
    expect(screen.getByLabelText('Actual arrival date and time')).toBeRequired();
  });

  it('shows the offline message after an entry request fails and does not show success', async () => {
    const user = userEvent.setup();

    answers({
      status: 200,
      body: VALID_PASS,
    });

    const fetchMock = global.fetch as jest.Mock;

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Rahim Hasan')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await user.click(screen.getByRole('button', { name: 'Confirm guest entry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No connection: use the intercom and paper register',
    );

    expect(screen.queryByText(/checked in successfully/)).not.toBeInTheDocument();
    expect(screen.queryByText(/recorded as Entered later/)).not.toBeInTheDocument();
  });

  it('displays an entry error without showing a success message', async () => {
    const user = userEvent.setup();

    answers(
      {
        status: 200,
        body: VALID_PASS,
      },
      {
        status: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'The pass allowance has changed. Check the pass again.',
          },
        },
      },
    );

    render(<GuardPassCheck />);

    await user.type(screen.getByLabelText('Guest pass code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Check pass' }));

    expect(await screen.findByText('Rahim Hasan')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm guest entry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The pass allowance has changed. Check the pass again.',
    );

    expect(screen.queryByText(/checked in successfully/)).not.toBeInTheDocument();
  });
});
