/**
 * Tests for creating accounts: generated usernames that are never the flat number (NFR-05), temporary passwords
 * that expire after 7 days (NFR-04), and the account itself (BR-15, BM-02).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  CODE_ALPHABET,
  TEMP_PASSWORD_LENGTH,
  createAccount,
  generateTempPassword,
  generateUsername,
  internalEmail,
  randomCode,
  tempPasswordExpiry,
  type AccountDeps,
  type RandomInt,
} from '@/services/accountService';
import { makeProfile, memoryAudit } from '@/services/testFakes';
import type { profiles } from '@/models';

const NOW = new Date('2026-11-20T10:00:00Z');
const USERNAME_PATTERN = new RegExp(`^bb-[${CODE_ALPHABET}]{6}$`);

/** Randomness that always picks the same index. */
const always =
  (index: number): RandomInt =>
  () =>
    index;

function setUp(taken: string[] = []) {
  const { audit, entries } = memoryAudit();
  const inserted: (typeof profiles.$inferInsert)[] = [];
  const users = {
    createUser: jest.fn(async () => 'user-1'),
    deleteUser: jest.fn(async () => {}),
  };
  const deps: AccountDeps = {
    users,
    audit,
    profiles: {
      usernameTaken: async (username) => taken.includes(username),
      insert: async (row) => {
        inserted.push(row);
        return makeProfile(row);
      },
    },
  };
  return { deps, users, inserted, entries };
}

describe('generateUsername (NFR-05)', () => {
  it('makes bb- and six characters from the safe alphabet', () => {
    for (let i = 0; i < 200; i += 1) expect(generateUsername()).toMatch(USERNAME_PATTERN);
  });

  it('is never a flat number like 4B or 12', () => {
    for (let i = 0; i < 200; i += 1) expect(generateUsername()).not.toMatch(/^\d+[A-Za-z]?$/);
  });

  it('is unlikely to repeat', () => {
    const names = new Set(Array.from({ length: 1000 }, () => generateUsername()));
    expect(names.size).toBe(1000);
  });

  it('never uses look-alike characters (l, 1, o, 0, i)', () => {
    expect(CODE_ALPHABET).not.toMatch(/[l1o0i]/);
  });
});

describe('randomCode', () => {
  it('uses the first and last letters of the alphabet at the edges (boundary)', () => {
    expect(randomCode(3, always(0))).toBe('aaa');
    expect(randomCode(3, always(CODE_ALPHABET.length - 1))).toBe('999');
  });

  it('returns an empty string for length 0 (boundary)', () => {
    expect(randomCode(0)).toBe('');
  });
});

describe('temporary passwords', () => {
  it(`are ${TEMP_PASSWORD_LENGTH} characters and pass the 8-character rule`, () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(TEMP_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it('expire exactly 7 days after they are issued (NFR-04)', () => {
    expect(tempPasswordExpiry(NOW).toISOString()).toBe('2026-11-27T10:00:00.000Z');
  });
});

describe('internalEmail', () => {
  it('puts the username under the .invalid domain', () => {
    expect(internalEmail('bb-4k7q2m')).toBe('bb-4k7q2m@users.baribondhu.invalid');
  });
});

describe('createAccount', () => {
  it('creates the Supabase user and a profile that must change its password (normal, BR-15)', async () => {
    const { deps, users, inserted } = setUp();
    const result = await createAccount(
      deps,
      { role: 'guard', displayName: ' Karim ' },
      'manager-1',
      NOW,
    );

    expect(result.username).toMatch(USERNAME_PATTERN);
    expect(users.createUser).toHaveBeenCalledWith(
      internalEmail(result.username),
      result.temporaryPassword,
    );
    expect(inserted[0]).toMatchObject({
      id: 'user-1',
      role: 'guard',
      displayName: 'Karim',
      mustChangePassword: true,
      tempPasswordExpiresAt: tempPasswordExpiry(NOW),
      active: true,
    });
  });

  it('logs the creation without the password (NFR-04, NFR-27)', async () => {
    const { deps, entries } = setUp();
    const result = await createAccount(
      deps,
      { role: 'guard', displayName: 'Karim' },
      'manager-1',
      NOW,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: 'manager-1', action: 'account.create' });
    expect(JSON.stringify(entries[0])).not.toContain(result.temporaryPassword);
  });

  it('links a household account to its occupancy and keeps an optional email', async () => {
    const { deps, inserted } = setUp();
    await createAccount(
      deps,
      { role: 'resident', displayName: 'Rahman family', occupancyId: 'occ-1', email: ' r@x.com ' },
      'manager-1',
      NOW,
    );
    expect(inserted[0]).toMatchObject({ occupancyId: 'occ-1', email: 'r@x.com', phone: null });
  });

  it('tries another username when one is taken', async () => {
    let calls = 0;
    const random: RandomInt = () => (calls++ < 6 ? 0 : 1); // first username is all "a", then "b"
    const { deps } = setUp(['bb-aaaaaa']);
    const result = await createAccount(
      deps,
      { role: 'guard', displayName: 'K' },
      null,
      NOW,
      random,
    );
    expect(result.username).toBe('bb-bbbbbb');
  });

  it.each([
    [{ role: 'resident' as const, displayName: 'H' }, 'A household account needs an occupancy.'],
    [
      { role: 'guard' as const, displayName: 'K', occupancyId: 'occ-1' },
      'Only household accounts belong to an occupancy.',
    ],
    [{ role: 'guard' as const, displayName: '   ' }, 'Enter a name for the account.'],
  ])('refuses %o (invalid input)', async (input, message) => {
    const { deps, users } = setUp();
    await expect(createAccount(deps, input, null, NOW)).rejects.toMatchObject({
      status: 400,
      message,
    });
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('gives up after 5 taken usernames (exception)', async () => {
    const { deps, users } = setUp(['bb-aaaaaa']);
    await expect(
      createAccount(deps, { role: 'guard', displayName: 'K' }, null, NOW, always(0)),
    ).rejects.toThrow(AppError);
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('removes the Supabase user again if saving the profile fails (exception)', async () => {
    const { deps, users } = setUp();
    deps.profiles.insert = async () => Promise.reject(new Error('insert failed'));
    await expect(
      createAccount(deps, { role: 'guard', displayName: 'K' }, null, NOW),
    ).rejects.toThrow('insert failed');
    expect(users.deleteUser).toHaveBeenCalledWith('user-1');
  });
});
