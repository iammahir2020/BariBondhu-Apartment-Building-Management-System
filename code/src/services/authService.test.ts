/**
 * Tests for logging in (RES-06, SG-01, BM-01, CM-05, MNT-06): the wrong-password limit (BR-14), deactivated
 * accounts, expired temporary passwords (NFR-04) and the idle limits (NFR-07).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  DEACTIVATED_MESSAGE,
  LOCKOUT_MINUTES,
  MAX_WRONG_PASSWORDS,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
  TOO_MANY_WRONG_MESSAGE,
  WRONG_LOGIN_MESSAGE,
  afterWrongPassword,
  attemptKey,
  isIdleExpired,
  isTempPasswordExpired,
  lockSecondsLeft,
  logIn,
  normaliseUsername,
  type SessionAuth,
} from '@/services/authService';
import { MemoryAttemptStore, makeProfile } from '@/services/testFakes';
import type { Profile } from '@/models';

const NOW = new Date('2026-11-20T10:00:00Z');
const MINUTE = 60 * 1000;
const RIGHT_PASSWORD = 'Dhaka2026';
const KEY = 'device:phone-1';

/** A fake Supabase sign-in that knows one user. */
function fakeAuth(profile: Profile) {
  const auth = {
    signIn: jest.fn(async (email: string, password: string) =>
      email === `${profile.username}@users.baribondhu.invalid` && password === RIGHT_PASSWORD
        ? profile.id
        : null,
    ),
    signOut: jest.fn(async () => {}),
  } satisfies SessionAuth;
  return auth;
}

function setUp(profile: Profile = makeProfile()) {
  const auth = fakeAuth(profile);
  const attempts = new MemoryAttemptStore();
  const deps = {
    auth,
    attempts,
    profiles: { findById: async (id: string) => (id === profile.id ? profile : undefined) },
  };
  const tryLogIn = (password: string, at: Date = NOW, key: string = KEY) =>
    logIn(deps, { username: profile.username, password, attemptKey: key }, at);
  return { auth, attempts, deps, tryLogIn, profile };
}

async function expectError(promise: Promise<unknown>, status: number, message: string) {
  await expect(promise).rejects.toThrow(AppError);
  await expect(promise).rejects.toMatchObject({ status, message });
}

describe('logIn', () => {
  it('returns the profile for the right username and password (normal)', async () => {
    const { tryLogIn, profile } = setUp();
    await expect(tryLogIn(RIGHT_PASSWORD)).resolves.toBe(profile);
  });

  it('accepts the username in capitals and with spaces around it', async () => {
    const { deps, profile } = setUp();
    await expect(
      logIn(deps, { username: '  BB-4K7Q2M ', password: RIGHT_PASSWORD, attemptKey: KEY }, NOW),
    ).resolves.toBe(profile);
  });

  it('gives the same message for an unknown username and a wrong password (invalid input)', async () => {
    const { deps, tryLogIn } = setUp();
    await expectError(tryLogIn('wrong-password'), 401, WRONG_LOGIN_MESSAGE);
    await expectError(
      logIn(deps, { username: 'bb-nobody', password: RIGHT_PASSWORD, attemptKey: 'device:2' }, NOW),
      401,
      WRONG_LOGIN_MESSAGE,
    );
  });

  describe('wrong-password limit (BR-14)', () => {
    it('allows the 4th wrong password, makes the 5th start a 15-minute wait, refuses the 6th', async () => {
      const { tryLogIn, auth } = setUp();
      for (let i = 1; i <= MAX_WRONG_PASSWORDS - 1; i += 1) {
        await expectError(tryLogIn(`wrong-${i}`), 401, WRONG_LOGIN_MESSAGE);
      }
      const fifth = tryLogIn('wrong-5');
      await expectError(fifth, 429, TOO_MANY_WRONG_MESSAGE);
      await expect(fifth).rejects.toMatchObject({
        details: { retryAfterSeconds: LOCKOUT_MINUTES * 60 },
      });

      const callsBefore = auth.signIn.mock.calls.length;
      await expectError(tryLogIn(RIGHT_PASSWORD), 429, TOO_MANY_WRONG_MESSAGE);
      expect(auth.signIn.mock.calls.length).toBe(callsBefore); // the password isn't even tried
    });

    it('shows how long is left during the wait', async () => {
      const { tryLogIn } = setUp();
      for (let i = 1; i <= MAX_WRONG_PASSWORDS; i += 1) await tryLogIn('wrong').catch(() => {});
      const later = new Date(NOW.getTime() + 6 * MINUTE);
      await expect(tryLogIn(RIGHT_PASSWORD, later)).rejects.toMatchObject({
        details: { retryAfterSeconds: 9 * 60 },
      });
    });

    it('lets the device log in again once 15 minutes have passed (boundary)', async () => {
      const { tryLogIn, profile } = setUp();
      for (let i = 1; i <= MAX_WRONG_PASSWORDS; i += 1) await tryLogIn('wrong').catch(() => {});
      const justBefore = new Date(NOW.getTime() + LOCKOUT_MINUTES * MINUTE - 1000);
      const exactlyAfter = new Date(NOW.getTime() + LOCKOUT_MINUTES * MINUTE);
      await expectError(tryLogIn(RIGHT_PASSWORD, justBefore), 429, TOO_MANY_WRONG_MESSAGE);
      await expect(tryLogIn(RIGHT_PASSWORD, exactlyAfter)).resolves.toBe(profile);
    });

    it('does not affect other devices', async () => {
      const { tryLogIn, profile } = setUp();
      for (let i = 1; i <= MAX_WRONG_PASSWORDS; i += 1) await tryLogIn('wrong').catch(() => {});
      await expect(tryLogIn(RIGHT_PASSWORD, NOW, 'device:laptop')).resolves.toBe(profile);
    });

    it('starts counting again after a successful log-in', async () => {
      const { tryLogIn, attempts } = setUp();
      for (let i = 1; i <= MAX_WRONG_PASSWORDS - 1; i += 1) await tryLogIn('wrong').catch(() => {});
      await tryLogIn(RIGHT_PASSWORD);
      expect(attempts.rows.has(KEY)).toBe(false);
      await expectError(tryLogIn('wrong'), 401, WRONG_LOGIN_MESSAGE);
    });

    it("on the gate device, one guard's wrong passwords never block another guard", async () => {
      const guardA = makeProfile({ id: 'guard-a', username: 'bb-guarda', role: 'guard' });
      const guardB = makeProfile({ id: 'guard-b', username: 'bb-guardb', role: 'guard' });
      const attempts = new MemoryAttemptStore();
      const auth = {
        signIn: async (email: string, password: string) =>
          password === RIGHT_PASSWORD && email.startsWith('bb-guardb@') ? guardB.id : null,
        signOut: async () => {},
      };
      const deps = {
        auth,
        attempts,
        profiles: { findById: async (id: string) => [guardA, guardB].find((p) => p.id === id) },
      };
      const gate = (username: string, password: string) =>
        logIn(deps, { username, password, attemptKey: attemptKey('gate-1', username, true) }, NOW);

      for (let i = 1; i <= MAX_WRONG_PASSWORDS; i += 1)
        await gate('bb-guarda', 'wrong').catch(() => {});
      await expectError(gate('bb-guarda', RIGHT_PASSWORD), 429, TOO_MANY_WRONG_MESSAGE);
      await expect(gate('bb-guardb', RIGHT_PASSWORD)).resolves.toBe(guardB);
    });
  });

  it('refuses a deactivated account and ends the session (CM-05)', async () => {
    const { tryLogIn, auth } = setUp(makeProfile({ active: false }));
    await expectError(tryLogIn(RIGHT_PASSWORD), 403, DEACTIVATED_MESSAGE);
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('refuses a temporary password older than 7 days (NFR-04)', async () => {
    const profile = makeProfile({ mustChangePassword: true, tempPasswordExpiresAt: NOW });
    const { tryLogIn, auth } = setUp(profile);
    await expectError(tryLogIn(RIGHT_PASSWORD), 403, TEMP_PASSWORD_EXPIRED_MESSAGE);
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('refuses a user with no profile (exception)', async () => {
    const profile = makeProfile();
    const auth = fakeAuth(profile);
    const deps = {
      auth,
      attempts: new MemoryAttemptStore(),
      profiles: { findById: async () => undefined },
    };
    await expectError(
      logIn(deps, { username: profile.username, password: RIGHT_PASSWORD, attemptKey: KEY }, NOW),
      401,
      WRONG_LOGIN_MESSAGE,
    );
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('passes on a failure of Supabase itself (exception)', async () => {
    const deps = {
      auth: {
        signIn: async () => Promise.reject(new Error('network down')),
        signOut: async () => {},
      },
      attempts: new MemoryAttemptStore(),
      profiles: { findById: async () => undefined },
    };
    await expect(
      logIn(deps, { username: 'bb-4k7q2m', password: RIGHT_PASSWORD, attemptKey: KEY }, NOW),
    ).rejects.toThrow('network down');
  });
});

describe('attemptKey', () => {
  it('counts per device on an ordinary browser, whatever the username', () => {
    expect(attemptKey('dev-1', 'bb-a', false)).toBe('device:dev-1');
    expect(attemptKey('dev-1', 'bb-b', false)).toBe('device:dev-1');
  });

  it('counts per username on the gate device, ignoring case and spaces', () => {
    expect(attemptKey('dev-1', ' BB-A ', true)).toBe('gate:dev-1:bb-a');
  });

  it('cuts very long usernames so the key stays short (invalid input)', () => {
    expect(attemptKey('dev-1', 'x'.repeat(500), true)).toBe(`gate:dev-1:${'x'.repeat(64)}`);
  });
});

describe('afterWrongPassword and lockSecondsLeft', () => {
  it('counts up without a wait until the 5th (boundary)', () => {
    const fourth = afterWrongPassword({ failedCount: 3, lockedUntil: null }, NOW);
    expect(fourth).toEqual({ failedCount: 4, lockedUntil: null });
    const fifth = afterWrongPassword(fourth, NOW);
    expect(fifth.failedCount).toBe(5);
    expect(lockSecondsLeft(fifth, NOW)).toBe(900);
  });

  it('restarts from 1 after a wait has ended', () => {
    const ended = { failedCount: 5, lockedUntil: new Date(NOW.getTime() - 1000) };
    expect(afterWrongPassword(ended, NOW)).toEqual({ failedCount: 1, lockedUntil: null });
  });

  it('has nothing left for an unknown key or no wait', () => {
    expect(lockSecondsLeft(undefined, NOW)).toBe(0);
    expect(lockSecondsLeft({ failedCount: 2, lockedUntil: null }, NOW)).toBe(0);
  });

  it('rounds the seconds left up', () => {
    const state = { failedCount: 5, lockedUntil: new Date(NOW.getTime() + 1500) };
    expect(lockSecondsLeft(state, NOW)).toBe(2);
  });
});

describe('isIdleExpired (NFR-07)', () => {
  const ago = (minutes: number) => NOW.getTime() - minutes * MINUTE;

  it.each(['guard', 'maintenance', 'admin'] as const)(
    'ends a %s session after 15 minutes',
    (role) => {
      expect(isIdleExpired(role, ago(15), NOW)).toBe(false);
      expect(isIdleExpired(role, ago(15) - 1, NOW)).toBe(true);
    },
  );

  it.each(['resident', 'manager', 'committee'] as const)(
    'ends a %s session after 7 days',
    (role) => {
      expect(isIdleExpired(role, ago(7 * 24 * 60), NOW)).toBe(false);
      expect(isIdleExpired(role, ago(7 * 24 * 60) - 1, NOW)).toBe(true);
    },
  );

  it('treats a missing or broken last-active time as idle (invalid input)', () => {
    expect(isIdleExpired('manager', null, NOW)).toBe(true);
    expect(isIdleExpired('manager', Number.NaN, NOW)).toBe(true);
  });
});

describe('isTempPasswordExpired', () => {
  it('is false once the user has chosen their own password', () => {
    expect(
      isTempPasswordExpired({ mustChangePassword: false, tempPasswordExpiresAt: NOW }, NOW),
    ).toBe(false);
  });

  it('is true from the expiry moment on (boundary)', () => {
    const at = (offset: number) => new Date(NOW.getTime() + offset);
    const profile = { mustChangePassword: true, tempPasswordExpiresAt: NOW };
    expect(isTempPasswordExpired(profile, at(-1))).toBe(false);
    expect(isTempPasswordExpired(profile, at(0))).toBe(true);
  });
});

describe('normaliseUsername', () => {
  it('trims and lower-cases', () => {
    expect(normaliseUsername('  BB-4K7Q2M\t')).toBe('bb-4k7q2m');
  });
});
