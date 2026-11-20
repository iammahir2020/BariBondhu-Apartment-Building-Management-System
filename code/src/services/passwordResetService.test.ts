/**
 * Tests for Forgot password (BR-15): who gets a link, where it goes, and setting a new password with it.
 *
 * @author Mahir Al Kamal
 */
import type { OutgoingEmail } from '@/lib/mailer';
import type { Profile } from '@/models';
import {
  ADMIN_RESET_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
  UNKNOWN_USERNAME_MESSAGE,
  maskEmail,
  requestPasswordReset,
  resetLink,
  resetPassword,
  type ResetPasswordDeps,
} from '@/services/passwordResetService';
import { DEACTIVATED_MESSAGE } from '@/services/authService';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/services/passwordRules';
import { makeProfile, memoryAudit } from '@/services/testFakes';

const APP_URL = 'https://baribondhu.example';

function requestSetUp(profile: Profile | undefined) {
  const sent: OutgoingEmail[] = [];
  const tokens = { create: jest.fn(async () => 'token-123'), verify: jest.fn() };
  const deps = {
    profiles: {
      findByUsername: async (username: string) =>
        profile && username === profile.username ? profile : undefined,
    },
    tokens,
    sendEmail: async (email: OutgoingEmail) => {
      sent.push(email);
    },
  };
  return { deps, sent, tokens };
}

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('hasan@example.com')).toBe('h•••@example.com');
  });

  it('works for a one-letter name (boundary)', () => {
    expect(maskEmail('h@example.com')).toBe('h•••@example.com');
  });

  it('hides everything when the address has no name before @ (invalid input)', () => {
    expect(maskEmail('@example.com')).toBe('•••');
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});

describe('resetLink', () => {
  it('points at the Reset password page with the token', () => {
    expect(resetLink(APP_URL, 'a b')).toBe(`${APP_URL}/reset-password?token=a+b`);
  });
});

describe('requestPasswordReset', () => {
  it('emails a link to the real address and shows it masked (normal)', async () => {
    const profile = makeProfile({ email: 'nasrin@example.com' });
    const { deps, sent, tokens } = requestSetUp(profile);
    await expect(requestPasswordReset(deps, ' BB-4K7Q2M ', APP_URL)).resolves.toEqual({
      sent: true,
      maskedEmail: 'n•••@example.com',
    });
    expect(tokens.create).toHaveBeenCalledWith('bb-4k7q2m@users.baribondhu.invalid');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('nasrin@example.com');
    expect(sent[0]?.text).toContain(`${APP_URL}/reset-password?token=token-123`);
    expect(sent[0]?.text).toContain('30 minutes');
  });

  it('sends nothing and says so when the account has no email (BR-15)', async () => {
    const { deps, sent, tokens } = requestSetUp(makeProfile({ email: null }));
    await expect(requestPasswordReset(deps, 'bb-4k7q2m', APP_URL)).resolves.toEqual({
      sent: false,
    });
    expect(sent).toHaveLength(0);
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown username (invalid input)', async () => {
    const { deps } = requestSetUp(undefined);
    await expect(requestPasswordReset(deps, 'bb-nobody', APP_URL)).rejects.toMatchObject({
      status: 404,
      message: UNKNOWN_USERNAME_MESSAGE,
    });
  });

  it('refuses a deactivated account and the administrator (exception)', async () => {
    const inactive = requestSetUp(makeProfile({ active: false, email: 'x@y.com' }));
    await expect(requestPasswordReset(inactive.deps, 'bb-4k7q2m', APP_URL)).rejects.toMatchObject({
      status: 403,
      message: DEACTIVATED_MESSAGE,
    });
    const admin = requestSetUp(makeProfile({ role: 'admin', email: 'x@y.com' }));
    await expect(requestPasswordReset(admin.deps, 'bb-4k7q2m', APP_URL)).rejects.toMatchObject({
      status: 400,
      message: ADMIN_RESET_MESSAGE,
    });
  });
});

describe('resetPassword', () => {
  /** `profile: null` means the token's user has no profile. */
  function setUp(profile: Profile | null = makeProfile(), tokenUser: string | null = 'user-1') {
    const { audit, entries } = memoryAudit();
    const deps: ResetPasswordDeps = {
      tokens: { create: jest.fn(), verify: jest.fn(async () => tokenUser) },
      profiles: {
        findById: async (id) => (profile !== null && profile.id === id ? profile : undefined),
        markPasswordChanged: jest.fn(async () => {}),
      },
      passwords: { update: jest.fn(async () => true) },
      audit,
    };
    return { deps, entries };
  }

  it('sets the password, signs in, clears the first-login flag and logs it (normal)', async () => {
    const { deps, entries } = setUp(makeProfile({ mustChangePassword: true }));
    const profile = await resetPassword(deps, 'token-123', 'NewPass2026');
    expect(profile.mustChangePassword).toBe(false);
    expect(deps.passwords.update).toHaveBeenCalledWith('NewPass2026');
    expect(deps.profiles.markPasswordChanged).toHaveBeenCalledWith('user-1');
    expect(entries[0]?.action).toBe('account.password_reset');
  });

  it('checks the password before using the one-time link, so a short one keeps the link (boundary)', async () => {
    const { deps } = setUp();
    await expect(resetPassword(deps, 'token-123', 'short12')).rejects.toMatchObject({
      message: PASSWORD_TOO_SHORT_MESSAGE,
    });
    expect(deps.tokens.verify).not.toHaveBeenCalled();
  });

  it('refuses an expired, used or made-up link (invalid input)', async () => {
    const { deps } = setUp(makeProfile(), null);
    await expect(resetPassword(deps, 'nonsense', 'NewPass2026')).rejects.toMatchObject({
      status: 400,
      message: RESET_LINK_INVALID_MESSAGE,
    });
  });

  it('refuses a deactivated account and a link for a missing profile (exception)', async () => {
    const inactive = setUp(makeProfile({ active: false }));
    await expect(resetPassword(inactive.deps, 't', 'NewPass2026')).rejects.toMatchObject({
      status: 403,
    });
    expect(inactive.deps.passwords.update).not.toHaveBeenCalled();

    const missing = setUp(null);
    await expect(resetPassword(missing.deps, 't', 'NewPass2026')).rejects.toMatchObject({
      message: RESET_LINK_INVALID_MESSAGE,
    });
  });
});
