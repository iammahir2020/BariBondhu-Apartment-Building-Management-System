/**
 * How blocks and flats are named on screen. The seed names blocks "A" and "B"; people say "Block A".
 *
 * @author Mahir Al Kamal
 */

/**
 * A block's name as people say it.
 * @param name - The stored name, like `A` or `Block A`.
 * @returns The name with "Block" in front, unless it already starts with it.
 */
export function blockLabel(name: string): string {
  return /^block\b/i.test(name) ? name : `Block ${name}`;
}

/**
 * A flat's full name, as receipts and the manager's lists show it.
 * @param blockName - The stored block name.
 * @param flatNumber - The flat number, like `3B`.
 * @returns Like `Block A, Flat 3B`.
 */
export function flatLabel(blockName: string, flatNumber: string): string {
  return `${blockLabel(blockName)}, Flat ${flatNumber}`;
}
