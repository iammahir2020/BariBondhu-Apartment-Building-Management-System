/**
 * Tests for choosing one's own password at first log-in (BR-15, NFR-04).
 *
 * @author Mahir Al Kamal
 */
import {
  SAME_PASSWORD_MESSAGE,
  setOwnPassword,
  type SetPasswordDeps,
} from '@/services/passwordService';
import { PASSWORD_TOO_SHORT_MESSAGE } from '@/services/passwordRules';
import { memoryAudit } from '@/services/testFakes';

function setUp(updateResult = true) {
  const { audit, entries } = memoryAudit();
  const passwords = { update: jest.fn(async () => updateResult) };
  const profiles = { markPasswordChanged: jest.fn(async () => {}) };
  const deps: SetPasswordDeps = { passwords, profiles, audit };
  return { deps, passwords, profiles, entries };
}

describe('setOwnPassword', () => {
  it('saves the password, clears the first-login flag and logs it without the password (normal)', async () => {
    const { deps, passwords, profiles, entries } = setUp();
    await setOwnPassword(deps, 'user-1', 'Dhaka2026');
    expect(passwords.update).toHaveBeenCalledWith('Dhaka2026');
    expect(profiles.markPasswordChanged).toHaveBeenCalledWith('user-1');
    expect(entries).toEqual([
      expect.objectContaining({ actorId: 'user-1', action: 'account.password_change' }),
    ]);
    expect(JSON.stringify(entries)).not.toContain('Dhaka2026');
  });

  it('refuses 7 characters without touching anything; 8 is enough (boundary)', async () => {
    const short = setUp();
    await expect(setOwnPassword(short.deps, 'user-1', 'abcdefg')).rejects.toMatchObject({
      status: 400,
      message: PASSWORD_TOO_SHORT_MESSAGE,
    });
    expect(short.passwords.update).not.toHaveBeenCalled();

    const exact = setUp();
    await expect(setOwnPassword(exact.deps, 'user-1', 'abcdefgh')).resolves.toBeUndefined();
  });

  it('refuses an empty password (invalid input)', async () => {
    const { deps } = setUp();
    await expect(setOwnPassword(deps, 'user-1', '')).rejects.toMatchObject({ status: 400 });
  });

  it('refuses the same password as now and keeps the first-login flag (exception)', async () => {
    const { deps, profiles, entries } = setUp(false);
    await expect(setOwnPassword(deps, 'user-1', 'Dhaka2026')).rejects.toMatchObject({
      status: 400,
      message: SAME_PASSWORD_MESSAGE,
    });
    expect(profiles.markPasswordChanged).not.toHaveBeenCalled();
    expect(entries).toHaveLength(0);
  });

  it('logs a reset from an email link under its own action', async () => {
    const { deps, entries } = setUp();
    await setOwnPassword(deps, 'user-1', 'Dhaka2026', 'account.password_reset');
    expect(entries[0]?.action).toBe('account.password_reset');
  });
});
