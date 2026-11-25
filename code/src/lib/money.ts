/**
 * Money as the pages show it (NFR-26): amounts are kept in whole poisha and shown in taka with two decimals, like
 * `৳4,850.00`, as in the prototype's Dues and Receipt screens.
 *
 * @author Mahir Al Kamal
 */

const TAKA = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Formats an amount.
 * @param poisha - The amount in whole poisha; negative for a credit or a reducing adjustment.
 * @returns The amount in taka, like `৳4,850.00` or `−৳200.00`.
 */
export function formatTaka(poisha: number): string {
  const taka = TAKA.format(Math.abs(poisha) / 100);
  return poisha < 0 ? `−৳${taka}` : `৳${taka}`;
}
