/**
 * @jest-environment jsdom
 */
/**
 * Tests for Your passes on the Guests tab (RES-03): open passes first, finished ones under Earlier and capped, each
 * row opening its pass, and the loading, empty and error states.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import { answerFetch } from '@/components/auth/testFetch';
import type { GuestPassView } from '@/lib/guestPassResponse';
import { EARLIER_LIMIT, MyGuestPassList } from './MyGuestPassList';

function pass(id: string, status: GuestPassView['status'], extra: Partial<GuestPassView> = {}) {
  return {
    id,
    guestName: `Guest ${id}`,
    guestCount: 1,
    guestsUsed: 0,
    startsAt: '2026-11-28T12:00:00.000Z',
    endsAt: '2026-11-28T18:00:00.000Z',
    code: '419061',
    status,
    cancelledAt: null,
    ...extra,
  } satisfies GuestPassView;
}

describe('MyGuestPassList', () => {
  it('lists open passes first and finished ones under Earlier', async () => {
    answerFetch(200, {
      passes: [
        pass('a', 'Expired'),
        pass('b', 'Active', { guestName: 'Rafiq Hasan', guestCount: 4, guestsUsed: 2 }),
        pass('c', 'Cancelled'),
        pass('d', 'Scheduled'),
      ],
    });
    render(<MyGuestPassList />);

    const open = await screen.findByRole('region', { name: 'Open and coming up' });
    const earlier = screen.getByRole('region', { name: 'Earlier' });
    expect(
      within(open)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('Rafiq Hasan + 3'), expect.stringContaining('Guest d')]);
    expect(within(open).getByText('2 of 4 arrived')).toBeInTheDocument();
    expect(within(earlier).getAllByRole('link')).toHaveLength(2);
  });

  it('links each pass to its code page', async () => {
    answerFetch(200, { passes: [pass('p-1', 'Active')] });
    render(<MyGuestPassList />);
    const link = await screen.findByRole('link', { name: /Guest p-1/ });
    expect(link).toHaveAttribute('href', '/resident/guest-passes/p-1');
  });

  it(`shows at most ${EARLIER_LIMIT} earlier passes (boundary)`, async () => {
    const old = Array.from({ length: EARLIER_LIMIT + 1 }, (_, i) => pass(`old-${i}`, 'Expired'));
    answerFetch(200, { passes: old });
    render(<MyGuestPassList />);
    const earlier = await screen.findByRole('region', { name: 'Earlier' });
    expect(within(earlier).getAllByRole('link')).toHaveLength(EARLIER_LIMIT);
    expect(screen.queryByRole('region', { name: 'Open and coming up' })).not.toBeInTheDocument();
  });

  it('shows a loading placeholder until the passes arrive', () => {
    global.fetch = jest.fn(() => new Promise<never>(() => undefined)) as unknown as typeof fetch;
    render(<MyGuestPassList />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your passes…');
  });

  it('says there are no passes yet when the list is empty (boundary)', async () => {
    answerFetch(200, { passes: [] });
    render(<MyGuestPassList />);
    expect(await screen.findByText(/No passes yet/)).toBeInTheDocument();
  });

  it('shows the error when the list fails (exception)', async () => {
    answerFetch(403, { error: { code: 'FORBIDDEN', message: 'You can’t do that.' } });
    render(<MyGuestPassList />);
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t do that.');
  });
});
