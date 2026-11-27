/**
 * Tests for the building's emergency numbers (SG-06, BR-12): their order, and rows the screen must never show.
 *
 * @author Mahir Al Kamal
 */
import type { EmergencyContact } from '@/models';
import { listEmergencyNumbers, type EmergencyContactStore } from './emergencyContactService';

function contact(overrides: Partial<EmergencyContact>): EmergencyContact {
  return { id: 'c-1', label: 'Guard desk', phone: '01700000111', order: 1, ...overrides };
}

function storeOf(rows: EmergencyContact[]): EmergencyContactStore {
  return { list: jest.fn(async () => rows) };
}

describe('listEmergencyNumbers', () => {
  it('returns the guard desk and the manager in the order the manager set (normal)', async () => {
    const numbers = await listEmergencyNumbers(
      storeOf([
        contact({ id: 'm', label: 'Manager', phone: '01700000222', order: 2 }),
        contact({ id: 'g', label: 'Guard desk', phone: '01700000111', order: 1 }),
      ]),
    );
    expect(numbers).toEqual([
      { label: 'Guard desk', phone: '01700000111' },
      { label: 'Manager', phone: '01700000222' },
    ]);
  });

  it('orders equal positions by label (boundary)', async () => {
    const numbers = await listEmergencyNumbers(
      storeOf([
        contact({ label: 'Manager', order: 1 }),
        contact({ label: 'Guard desk', order: 1 }),
      ]),
    );
    expect(numbers.map((n) => n.label)).toEqual(['Guard desk', 'Manager']);
  });

  it('never shows an empty number or a second 999, since 999 is fixed on the screen (BR-12)', async () => {
    const numbers = await listEmergencyNumbers(
      storeOf([
        contact({ label: 'Empty', phone: '  ' }),
        contact({ label: 'National', phone: '999' }),
        contact({ label: 'Manager', phone: ' 01700000222 ', order: 2 }),
      ]),
    );
    expect(numbers).toEqual([{ label: 'Manager', phone: '01700000222' }]);
  });

  it('is empty before the manager sets any number (boundary)', async () => {
    await expect(listEmergencyNumbers(storeOf([]))).resolves.toEqual([]);
  });

  it('passes on a store failure (exception)', async () => {
    const failing: EmergencyContactStore = {
      list: jest.fn(async () => {
        throw new Error('database down');
      }),
    };
    await expect(listEmergencyNumbers(failing)).rejects.toThrow('database down');
  });
});
