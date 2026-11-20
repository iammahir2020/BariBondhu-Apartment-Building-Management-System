/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Log out button: it ends the session and goes to Log in, or shows the error and stays.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './LogoutButton';
import { answerFetch } from './testFetch';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
}));

const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (message: string) => toastError(message) } }));

beforeEach(() => {
  replace.mockClear();
  toastError.mockClear();
});

describe('LogoutButton', () => {
  it('ends the session and goes to Log in (normal)', async () => {
    const fetch = answerFetch(204, null);
    render(<LogoutButton />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }));
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('shows the error and stays when logging out fails (exception)', async () => {
    answerFetch(500, {
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    render(<LogoutButton />);
    const button = screen.getByRole('button', { name: 'Log out' });
    await userEvent.setup().click(button);
    expect(toastError).toHaveBeenCalledWith('Something went wrong. Please try again.');
    expect(replace).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });
});
