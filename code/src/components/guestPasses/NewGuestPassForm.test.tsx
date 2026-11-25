/**
 * @jest-environment jsdom
 */
/**
 * Tests for the New guest pass form (RES-03): what it sends, the stepper's 1 to 20 range, the quick choices for the
 * time, opening the new pass's code, and the API's error shown with what was typed kept. Case IDs are from
 * `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetch, failFetch } from '@/components/auth/testFetch';
import { NewGuestPassForm } from './NewGuestPassForm';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

/** 25 Nov 2026, 2:20 pm local time. */
const NOW = new Date(2026, 10, 25, 14, 20);
const clock = () => NOW;

beforeEach(() => {
  push.mockClear();
});

/** The JSON body of the first request the form sent. */
function sentBody(mock: jest.Mock): Record<string, unknown> {
  const init = mock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('NewGuestPassForm', () => {
  it('creates a pass and opens its code (TC-R03-01)', async () => {
    const user = userEvent.setup();
    const fetchMock = answerFetch(201, { pass: { id: 'pass-1' } });
    render(<NewGuestPassForm now={clock} />);

    await user.type(screen.getByLabelText('Guest name'), 'Rafiq Hasan');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Create pass' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/guest-passes',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sentBody(fetchMock)).toEqual({
      guestName: 'Rafiq Hasan',
      guestCount: 3,
      startsAt: NOW.toISOString(),
      endsAt: new Date(2026, 10, 25, 20, 20).toISOString(),
    });
    expect(push).toHaveBeenCalledWith('/resident/guest-passes/pass-1');
  });

  it('starts with "Today, next 6 hours" chosen and its times filled in', () => {
    render(<NewGuestPassForm now={clock} />);
    expect(screen.getByRole('button', { name: 'Today, next 6 hours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-25T14:20');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-11-25T20:20');
  });

  it('fills in 6 pm to 11 pm for "This evening"', async () => {
    const user = userEvent.setup();
    render(<NewGuestPassForm now={clock} />);
    await user.click(screen.getByRole('button', { name: 'This evening' }));
    expect(screen.getByRole('button', { name: 'This evening' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-25T18:00');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-11-25T23:00');
  });

  it('keeps the times for "Pick times", and changing a time picks times', async () => {
    const user = userEvent.setup();
    render(<NewGuestPassForm now={clock} />);
    await user.click(screen.getByRole('button', { name: 'Pick times' }));
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-25T14:20');

    await user.click(screen.getByRole('button', { name: 'This evening' }));
    const until = screen.getByLabelText('Until');
    await user.clear(until);
    await user.type(until, '2026-11-26T01:30');
    expect(screen.getByRole('button', { name: 'Pick times' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(until).toHaveValue('2026-11-26T01:30');
  });

  it('keeps the number of people between 1 and 20 (RES-03)', async () => {
    const user = userEvent.setup();
    render(<NewGuestPassForm now={clock} />);
    const fewer = screen.getByRole('button', { name: 'One fewer' });
    const more = screen.getByRole('button', { name: 'One more' });
    expect(fewer).toBeDisabled();

    for (let i = 0; i < 25; i += 1) await user.click(more);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(more).toBeDisabled();

    await user.click(fewer);
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(more).toBeEnabled();
  });

  it("shows the API's message and keeps what was typed", async () => {
    const user = userEvent.setup();
    answerFetch(400, { error: { code: 'BAD_REQUEST', message: 'Check the visit times' } });
    render(<NewGuestPassForm now={clock} />);

    await user.type(screen.getByLabelText('Guest name'), 'Rafiq Hasan');
    await user.click(screen.getByRole('button', { name: 'Create pass' }));

    expect(await screen.findByText('Check the visit times')).toBeInTheDocument();
    expect(screen.getByLabelText('Guest name')).toHaveValue('Rafiq Hasan');
    expect(screen.getByRole('button', { name: 'Create pass' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('sends empty times when a box is cleared, so the API answers "Check the visit times"', async () => {
    const user = userEvent.setup();
    const fetchMock = answerFetch(400, {
      error: { code: 'BAD_REQUEST', message: 'Check the visit times' },
    });
    render(<NewGuestPassForm now={clock} />);
    await user.clear(screen.getByLabelText('From'));
    await user.click(screen.getByRole('button', { name: 'Create pass' }));
    expect(sentBody(fetchMock)).toMatchObject({ startsAt: '' });
  });

  it('says so when the server cannot be reached', async () => {
    const user = userEvent.setup();
    failFetch();
    render(<NewGuestPassForm now={clock} />);
    await user.click(screen.getByRole('button', { name: 'Create pass' }));
    expect(
      await screen.findByText('Could not reach the server. Check the connection and try again.'),
    ).toBeInTheDocument();
  });

  it('works with the real clock', () => {
    render(<NewGuestPassForm />);
    expect(screen.getByLabelText('From')).not.toHaveValue('');
  });
});
