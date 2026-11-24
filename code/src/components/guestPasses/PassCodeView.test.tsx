/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Pass code screen (RES-03): the code and details, Share through the share sheet or by copying,
 * cancelling with a confirm step (TC-R03-19), and the API's errors. Case IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GuestPassView } from '@/lib/guestPassResponse';
import { PassCodeView } from './PassCodeView';

const PASS: GuestPassView = {
  id: 'pass-1',
  guestName: 'Rafiq Hasan',
  guestCount: 4,
  guestsUsed: 2,
  startsAt: '2026-11-25T11:00:00.000Z',
  endsAt: '2026-11-25T17:00:00.000Z',
  code: '482913',
  status: 'Partly used',
  cancelledAt: null,
};

/** One answer of the fake `fetch`. */
interface Answer {
  status: number;
  body: unknown;
}

/** Makes `fetch` give these answers in turn, the last one again once they run out. */
function answers(...list: Answer[]): jest.Mock {
  let i = 0;
  const mock = jest.fn(async () => {
    const answer = list[Math.min(i, list.length - 1)] as Answer;
    i += 1;
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => JSON.stringify(answer.body),
    };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Sets or removes `navigator.share` and `navigator.clipboard` for one test. */
function setNavigator(values: { share?: unknown; clipboard?: unknown }): void {
  for (const key of ['share', 'clipboard'] as const) {
    Object.defineProperty(navigator, key, { value: values[key], configurable: true });
  }
}

afterEach(() => {
  setNavigator({});
});

describe('PassCodeView', () => {
  it('shows the guest, status, people, times and the split code (TC-R03-01)', async () => {
    const fetchMock = answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    expect(await screen.findByText('482 913')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/guest-passes/pass-1', expect.anything());
    expect(screen.getByRole('heading', { name: 'Rafiq Hasan' })).toBeInTheDocument();
    expect(screen.getByText('Partly used')).toBeInTheDocument();
    expect(screen.getByText('4 people · 25 Nov, 5:00 pm to 11:00 pm')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 guests came in')).toBeInTheDocument();
    expect(screen.getByText('2 more can still come in until 25 Nov, 11:00 pm')).toBeInTheDocument();
  });

  it('says no guests have come in on a new pass', async () => {
    answers({ status: 200, body: { pass: { ...PASS, guestsUsed: 0, status: 'Scheduled' } } });
    render(<PassCodeView passId="pass-1" />);
    expect(await screen.findByText('No guests have come in yet')).toBeInTheDocument();
  });

  it('shares the pass through the share sheet (RES-03 c1)', async () => {
    const user = userEvent.setup();
    const share = jest.fn(async () => {});
    setNavigator({ share });
    answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Guest pass',
      text: expect.stringContaining('Show code 482 913'),
    });
  });

  it('says nothing when the share sheet is closed', async () => {
    const user = userEvent.setup();
    setNavigator({ share: jest.fn(async () => Promise.reject(new Error('AbortError'))) });
    answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(screen.queryByText(/Could not share/)).not.toBeInTheDocument();
  });

  it('copies the pass where there is no share sheet, as on a laptop', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn(async () => {});
    setNavigator({ clipboard: { writeText } });
    answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Guest pass for Rafiq Hasan'));
    expect(await screen.findByText(/Copied the pass/)).toBeInTheDocument();
  });

  it('says so when it can neither share nor copy', async () => {
    const user = userEvent.setup();
    setNavigator({
      clipboard: { writeText: jest.fn(async () => Promise.reject(new Error('no'))) },
    });
    answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByText(/Could not share the pass/)).toBeInTheDocument();
  });

  it('cancels the pass after asking first (TC-R03-19)', async () => {
    const user = userEvent.setup();
    const fetchMock = answers(
      { status: 200, body: { pass: PASS } },
      { status: 200, body: { pass: { ...PASS, status: 'Cancelled' } } },
    );
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Cancel pass' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Cancel this pass?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, cancel the pass' }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/guest-passes/pass-1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel pass' })).not.toBeInTheDocument();
  });

  it('keeps the pass when the resident changes their mind', async () => {
    const user = userEvent.setup();
    const fetchMock = answers({ status: 200, body: { pass: PASS } });
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Cancel pass' }));
    await user.click(screen.getByRole('button', { name: 'Keep the pass' }));
    expect(screen.queryByRole('heading', { name: 'Cancel this pass?' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the API's message when the pass can no longer be cancelled (TC-R03-20)", async () => {
    const user = userEvent.setup();
    answers(
      { status: 200, body: { pass: PASS } },
      {
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'Every guest on this pass has already come in.' },
        },
      },
    );
    render(<PassCodeView passId="pass-1" />);

    await user.click(await screen.findByRole('button', { name: 'Cancel pass' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel the pass' }));
    expect(
      await screen.findByText('Every guest on this pass has already come in.'),
    ).toBeInTheDocument();
  });

  it.each(['Fully used', 'Cancelled', 'Expired'] as const)(
    'offers no Cancel pass for a %s pass',
    async (status) => {
      answers({ status: 200, body: { pass: { ...PASS, status } } });
      render(<PassCodeView passId="pass-1" />);
      expect(await screen.findByText(status)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel pass' })).not.toBeInTheDocument();
      expect(screen.queryByText(/more can still come in/)).not.toBeInTheDocument();
    },
  );

  it("shows the API's message for another household's pass (TC-R03-23)", async () => {
    answers({
      status: 403,
      body: { error: { code: 'FORBIDDEN', message: "This isn't your household's pass." } },
    });
    render(<PassCodeView passId="pass-1" />);
    expect(await screen.findByText("This isn't your household's pass.")).toBeInTheDocument();
    expect(screen.queryByText('Pass code')).not.toBeInTheDocument();
  });

  it('says it is loading before the pass arrives', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<PassCodeView passId="pass-1" />);
    expect(screen.getByText('Loading the pass…')).toBeInTheDocument();
  });
});
