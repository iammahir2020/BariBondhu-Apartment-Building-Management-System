/**
 * Helpers for the Emergency screen (SG-06, BB-2006): how a number reads and dials, and the copy of the building
 * numbers kept on the device, so 999 and the last loaded numbers still show when the connection is lost.
 *
 * @author Mahir Al Kamal
 */
import type { EmergencyNumber } from '@/services/emergencyContactService';

/** Where the last loaded building numbers are kept in the browser. */
export const EMERGENCY_CACHE_KEY = 'baribondhu.emergencyNumbers';

/** The building numbers saved on the device, and when they were loaded. */
export interface SavedNumbers {
  numbers: EmergencyNumber[];
  /** ISO time they were loaded. */
  savedAt: string;
}

/** The part of `localStorage` the screen uses, so tests can pass a fake. */
export type NumberStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * A number as people read it: an 11-digit mobile number gets a dash after the operator code.
 * @param phone - The stored number, like `01700000111`.
 * @returns Like `01700-000111`; any other number unchanged.
 */
export function formatPhone(phone: string): string {
  return /^01\d{9}$/.test(phone) ? `${phone.slice(0, 5)}-${phone.slice(5)}` : phone;
}

/**
 * The link that dials a number.
 * @param phone - The number, with or without spaces and dashes.
 * @returns Like `tel:01700000111`.
 */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * Keeps the numbers on the device. Storage can be full or blocked; the screen works without it.
 * @param storage - Where to keep them.
 * @param numbers - The numbers just loaded.
 * @param now - When they were loaded.
 */
export function saveNumbers(storage: NumberStorage, numbers: EmergencyNumber[], now: Date): void {
  const saved: SavedNumbers = { numbers, savedAt: now.toISOString() };
  try {
    storage.setItem(EMERGENCY_CACHE_KEY, JSON.stringify(saved));
  } catch {
    // Nothing to do: the numbers are still on screen, only the offline copy is missing.
  }
}

/** Whether a value read back from storage is one building number. */
function isNumber(value: unknown): value is EmergencyNumber {
  return (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    typeof value.label === 'string' &&
    'phone' in value &&
    typeof value.phone === 'string'
  );
}

/**
 * Reads the numbers kept on the device.
 * @param storage - Where they were kept.
 * @returns The saved numbers, or null if none were saved or what was saved can't be read.
 */
export function loadNumbers(storage: NumberStorage): SavedNumbers | null {
  let parsed: unknown;
  try {
    const text = storage.getItem(EMERGENCY_CACHE_KEY);
    if (text === null) return null;
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('numbers' in parsed) ||
    !Array.isArray(parsed.numbers) ||
    !parsed.numbers.every(isNumber) ||
    !('savedAt' in parsed) ||
    typeof parsed.savedAt !== 'string'
  ) {
    return null;
  }
  return { numbers: parsed.numbers, savedAt: parsed.savedAt };
}
