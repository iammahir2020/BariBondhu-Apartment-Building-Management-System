/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Log in form: it shows the API's error text, the wait after too many wrong passwords (BR-14) and the
 * idle notice (NFR-07), and goes to the home the API names.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';
import { answerFetch, failFetch } from './testFetch';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
}));

async function logIn(password = 'wrong-password') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), 'bb-4k7q2m');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

beforeEach(() => replace.mockClear());

describe('LoginForm', () => {
  it('keeps Log in disabled until both fields are filled (boundary)', async () => {
    render(<LoginForm />);
    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).toBeDisabled();
    await userEvent.setup().type(screen.getByLabelText('Username'), 'bb-4k7q2m');
    expect(button).toBeDisabled();
  });

  it('goes to the home the API names (normal)', async () => {
    answerFetch(200, { role: 'manager', home: '/manager', mustChangePassword: false });
    render(<LoginForm />);
    await logIn('Dhaka2026');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(replace).toHaveBeenCalledWith('/manager');
  });

  it('shows the error text from the API and clears the password (invalid input)', async () => {
    answerFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Wrong username or password.' } });
    render(<LoginForm />);
    await logIn();
    expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows how many minutes the device must wait (BR-14)', async () => {
    answerFetch(429, {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many wrong passwords.',
        details: { retryAfterSeconds: 841 },
      },
    });
    render(<LoginForm />);
    await logIn();
    expect(await screen.findByText('Too many wrong passwords')).toBeInTheDocument();
    expect(screen.getByText(/can try again in 15 minutes/)).toBeInTheDocument();
  });

  it('says "1 minute" when less than a minute is left (boundary)', async () => {
    answerFetch(429, {
      error: { code: 'TOO_MANY_REQUESTS', message: 'x', details: { retryAfterSeconds: 20 } },
    });
    render(<LoginForm />);
    await logIn();
    expect(await screen.findByText(/can try again in 1 minute\./)).toBeInTheDocument();
  });

  it('says the server could not be reached when the network fails (exception)', async () => {
    failFetch();
    render(<LoginForm />);
    await logIn();
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });

  it('explains an idle log-out (NFR-07)', () => {
    render(<LoginForm endedForIdle />);
    expect(screen.getByText(/logged out because the app was not used/)).toBeInTheDocument();
  });
});
