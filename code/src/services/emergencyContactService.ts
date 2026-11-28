/**
 * The building's emergency numbers for the Emergency screen (SG-06, BM-10, BR-12, BB-2005, BB-2007).
 * 999 is fixed and always shown first, so it is never stored or edited.
 *
 * @author Adika Rahman
 */
import type { EmergencyContact } from '@/models';
import { AppError } from '@/lib/errors';

/** Bangladesh's national emergency number. It can't be edited or removed (BR-12). */
export const NATIONAL_EMERGENCY_NUMBER = '999';

/** Where the building numbers are read from and updated. */
export interface EmergencyContactStore {
  /** Every building number, in the order the manager set. */
  list(): Promise<EmergencyContact[]>;
  /** Changes the phone number of the building number with this label; undefined when there is none. */
  updateByLabel(label: string, phone: string): Promise<EmergencyContact | undefined>;
}

/** One building number as the Emergency screen shows it. */
export interface EmergencyNumber {
  label: string;
  phone: string;
}

/**
 * The building numbers in the order the manager set.
 * @param store - Where the numbers are read from.
 * @returns The building numbers, lowest order first.
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

/**
 * Changes the phone number of the Guard desk or Manager.
 * @param store - Where the building numbers are stored.
 * @param label - The contact to change.
 * @param phone - The new phone number.
 * @returns The updated contact.
 */
export async function updateEmergencyNumber(
  store: EmergencyContactStore,
  label: string,
  phone: string,
): Promise<EmergencyNumber> {
  if (label !== 'Guard desk' && label !== 'Manager') {
    throw new AppError('BAD_REQUEST', 'Choose Guard desk or Manager.');
  }

  const cleanedPhone = phone.trim();

  if (!/^\d{9,11}$/.test(cleanedPhone) || cleanedPhone === NATIONAL_EMERGENCY_NUMBER) {
    throw new AppError('BAD_REQUEST', 'Enter a valid phone number (9 to 11 digits).');
  }

  const updated = await store.updateByLabel(label, cleanedPhone);

  if (!updated) {
    throw new AppError('NOT_FOUND', 'Emergency contact not found.');
  }

  return { label: updated.label, phone: updated.phone };
}
