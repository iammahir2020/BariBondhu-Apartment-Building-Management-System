/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Emergency screen (SG-06, BR-12): 999 first, then the building numbers; the device copy when offline
 * or signed out; and a server error.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import { answerFetch } from '@/components/auth/testFetch';
import { EmergencyView } from './EmergencyView';
import { EMERGENCY_CACHE_KEY } from './emergencyNumbers';

const NUMBERS = [
  { label: 'Guard desk', phone: '01700000111' },
  { label: 'Manager', phone: '01700000222' },
];

function offline(): void {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('EmergencyView', () => {
  it('shows 999 first, then the guard desk and manager, each with a Call link (normal)', async () => {
    answerFetch(200, { numbers: NUMBERS });
    render(<EmergencyView />);

    expect(await screen.findByText('01700-000111')).toBeInTheDocument();
    const calls = screen.getAllByRole('link', { name: /^Call / });
    expect(calls.map((link) => link.getAttribute('href'))).toEqual([
      'tel:999',
      'tel:01700000111',
      'tel:01700000222',
    ]);
    expect(within(calls[0]!).getByText('Call')).toBeInTheDocument();
  });

  it('keeps the numbers on the device for next time (normal)', async () => {
    answerFetch(200, { numbers: NUMBERS });
    render(<EmergencyView />);
    await screen.findByText('01700-000111');
    expect(window.localStorage.getItem(EMERGENCY_CACHE_KEY)).toContain('Guard desk');
  });

  it('still shows 999 and the last loaded numbers when offline (SG-06 c3)', async () => {
    window.localStorage.setItem(
      EMERGENCY_CACHE_KEY,
      JSON.stringify({ numbers: NUMBERS, savedAt: '2026-11-25T14:00:00Z' }),
    );
    offline();
    render(<EmergencyView />);

    expect(await screen.findByText(/You're offline\./)).toBeInTheDocument();
    expect(screen.getByText('01700-000222')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 999' })).toHaveAttribute('href', 'tel:999');
  });

  it('offers 999 even offline with nothing saved yet (boundary)', async () => {
    offline();
    render(<EmergencyView />);
    expect(
      await screen.findByText(/No building numbers are saved on this device yet\./),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Call / })).toHaveLength(1);
  });

  it('asks a signed-out user to log in for the latest numbers (boundary)', async () => {
    answerFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Log in to continue.' } });
    render(<EmergencyView />);
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Call 999' })).toBeInTheDocument();
  });

  it('shows a server error but keeps 999 (exception)', async () => {
    answerFetch(500, {
      error: { code: 'INTERNAL', message: 'Something went wrong. Try again in a minute.' },
    });
    render(<EmergencyView />);
    expect(
      await screen.findByText(/Something went wrong\. Try again in a minute\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 999' })).toBeInTheDocument();
  });

  it('says so when the manager has added no numbers yet (boundary)', async () => {
    answerFetch(200, { numbers: [] });
    render(<EmergencyView />);
    expect(
      await screen.findByText("The manager hasn't added the building numbers yet."),
    ).toBeInTheDocument();
  });
});
