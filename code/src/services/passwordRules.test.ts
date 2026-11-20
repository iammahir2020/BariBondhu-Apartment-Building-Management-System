/**
 * Tests for the password rules: at least 8 characters (BR-15, NFR-04) and at most 72 bytes (bcrypt's limit).
 *
 * @author Mahir Al Kamal
 */
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  passwordProblem,
} from './passwordRules';

describe('passwordProblem', () => {
  it('accepts an ordinary password (normal)', () => {
    expect(passwordProblem('Dhaka2026')).toBeNull();
  });

  it('refuses 7 characters, accepts 8 and 9 (boundary, BR-15)', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordProblem('a'.repeat(7))).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    expect(passwordProblem('a'.repeat(8))).toBeNull();
    expect(passwordProblem('a'.repeat(9))).toBeNull();
  });

  it('refuses an empty password (invalid input)', () => {
    expect(passwordProblem('')).toBe(PASSWORD_TOO_SHORT_MESSAGE);
  });

  it('accepts 72 bytes and refuses 73 (boundary)', () => {
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe(PASSWORD_TOO_LONG_MESSAGE);
  });

  it('counts bytes, not letters, for Bangla text (exception: multi-byte characters)', () => {
    // Each Bangla letter is 3 bytes in UTF-8: 24 letters = 72 bytes, 25 = 75 bytes.
    expect(passwordProblem('ক'.repeat(24))).toBeNull();
    expect(passwordProblem('ক'.repeat(25))).toBe(PASSWORD_TOO_LONG_MESSAGE);
  });
});
