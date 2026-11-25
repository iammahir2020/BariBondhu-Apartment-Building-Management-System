/**
 * Tests for showing money in taka.
 *
 * @author Mahir Al Kamal
 */
import { formatTaka } from '@/lib/money';

describe('formatTaka', () => {
  it.each([
    [485_000, '৳4,850.00'],
    [350_050, '৳3,500.50'],
    [1, '৳0.01'],
    [0, '৳0.00'],
    [123_456_789, '৳1,234,567.89'],
    [-20_000, '−৳200.00'],
  ])('shows %i poisha as %s', (poisha, shown) => {
    expect(formatTaka(poisha)).toBe(shown);
  });
});
