/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Set new password form (BR-15): it blocks passwords under 8 characters and mismatched fields before
 * calling the API, and shows the API's error.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewPasswordForm, PASSWORDS_DIFFER_MESSAGE } from './NewPasswordForm';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/services/passwordRules';
import { answerFetch } from './testFetch';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
}));

async function submit(password: string, confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Type it again'), confirm);
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
}

beforeEach(() => {
  replace.mockClear();
  answerFetch(200, { home: '/resident' });
});

describe('NewPasswordForm', () => {
  function renderForm() {
    render(<NewPasswordForm endpoint="/api/passwords" submitLabel="Save and continue" />);
  }

  it('blocks 7 characters without calling the API (boundary)', async () => {
    renderForm();
    await submit('abcdefg');
    expect(screen.getByText(PASSWORD_TOO_SHORT_MESSAGE)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('saves 8 characters and goes home (boundary, normal)', async () => {
    renderForm();
    await submit('abcdefgh');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/passwords',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'abcdefgh' }) }),
    );
    expect(replace).toHaveBeenCalledWith('/resident');
  });

  it('blocks two different passwords (invalid input)', async () => {
    renderForm();
    await submit('Dhaka2026', 'Dhaka2027');
    expect(screen.getByText(PASSWORDS_DIFFER_MESSAGE)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the error the API returns (exception)', async () => {
    answerFetch(400, {
      error: {
        code: 'BAD_REQUEST',
        message: 'Choose a password different from the one you have now.',
      },
    });
    renderForm();
    await submit('Dhaka2026');
    expect(
      await screen.findByText('Choose a password different from the one you have now.'),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends extra fields, like the reset token, with the password', async () => {
    render(
      <NewPasswordForm
        endpoint="/api/password-resets"
        method="PUT"
        extraBody={{ token: 't-1' }}
        submitLabel="Save and continue"
      />,
    );
    await submit('Dhaka2026');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/password-resets',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ token: 't-1', password: 'Dhaka2026' }),
      }),
    );
  });
});
