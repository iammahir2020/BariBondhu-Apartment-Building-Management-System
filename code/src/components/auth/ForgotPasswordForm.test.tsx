/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Forgot password form (BR-15): "Check your email" with the masked address, "This account has no
 * email", or the API's error.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { answerFetch } from './testFetch';

async function ask(username: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), username);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('ForgotPasswordForm', () => {
  it('says where the link went, masked, and that it works for 30 minutes (normal)', async () => {
    const fetch = answerFetch(200, { sent: true, maskedEmail: 'h•••@example.com' });
    render(<ForgotPasswordForm />);
    await ask('bb-4k7q2m');
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText(/h•••@example\.com\. It works for 30 minutes\./)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/password-resets',
      expect.objectContaining({ body: JSON.stringify({ username: 'bb-4k7q2m' }) }),
    );
  });

  it('tells a user without an email to ask the manager (BR-15)', async () => {
    answerFetch(200, { sent: false });
    render(<ForgotPasswordForm />);
    await ask('bb-4k7q2m');
    expect(await screen.findByText('This account has no email')).toBeInTheDocument();
    expect(screen.getByText(/Ask the building manager/)).toBeInTheDocument();
  });

  it('keeps the button disabled for an empty or blank username (boundary)', async () => {
    render(<ForgotPasswordForm />);
    const button = screen.getByRole('button', { name: 'Send reset link' });
    expect(button).toBeDisabled();
    await userEvent.setup().type(screen.getByLabelText('Username'), '   ');
    expect(button).toBeDisabled();
  });

  it('shows the error the API returns (invalid input)', async () => {
    answerFetch(404, {
      error: {
        code: 'NOT_FOUND',
        message: 'No account has this username. Check it and try again.',
      },
    });
    render(<ForgotPasswordForm />);
    await ask('bb-nobody');
    expect(await screen.findByText(/No account has this username/)).toBeInTheDocument();
  });
});
