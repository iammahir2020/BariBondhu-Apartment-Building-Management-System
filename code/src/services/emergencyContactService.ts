/**
 * The building's emergency numbers for the Emergency screen (SG-06, BM-10, BR-12, BB-2005). 999 is fixed and always
 * shown first by the screen itself, so it is never stored; this service returns the building numbers the manager
 * keeps up to date (the guard desk and the manager), in their set order.
 *
 * @author Mahir Al Kamal
 */
import type { EmergencyContact } from '@/models';

/** Bangladesh's national emergency number. It can't be edited or removed (BR-12). */
export const NATIONAL_EMERGENCY_NUMBER = '999';

/** Where the building numbers are read from. */
export interface EmergencyContactStore {
  /** Every stored building number, in any order. */
  list(): Promise<EmergencyContact[]>;
}

/** One building number as the Emergency screen shows it. */
export interface EmergencyNumber {
  /** Like `Guard desk` or `Manager`. */
  label: string;
  /** The number as stored, like `01700000111`. */
  phone: string;
}

/**
 * The building numbers in the order the manager set, ready to show after 999. A row with an empty phone, or one that
 * repeats 999, is left out: 999 is fixed on the screen, and a building number can't be empty (BR-12).
 * @param store - Where the numbers are read from.
 * @returns The numbers, lowest `order` first; equal orders by label.
 */
export async function listEmergencyNumbers(
  store: EmergencyContactStore,
): Promise<EmergencyNumber[]> {
  const rows = await store.list();
  return rows
    .filter((row) => row.phone.trim() !== '' && row.phone.trim() !== NATIONAL_EMERGENCY_NUMBER)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((row) => ({ label: row.label, phone: row.phone.trim() }));
}
