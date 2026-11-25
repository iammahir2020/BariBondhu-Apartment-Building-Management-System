/**
 * Tests for block and flat names on screen.
 *
 * @author Mahir Al Kamal
 */
import { blockLabel, flatLabel } from './flatLabel';

describe('blockLabel', () => {
  it('puts "Block" in front of a bare name, and leaves a full name alone (normal, boundary)', () => {
    expect(blockLabel('A')).toBe('Block A');
    expect(blockLabel('Block B')).toBe('Block B');
    expect(blockLabel('block c')).toBe('block c');
    expect(blockLabel('Blockade')).toBe('Block Blockade');
  });
});

describe('flatLabel', () => {
  it('names the block and the flat (normal)', () => {
    expect(flatLabel('A', '3B')).toBe('Block A, Flat 3B');
    expect(flatLabel('Block B', '1A')).toBe('Block B, Flat 1A');
  });
});
