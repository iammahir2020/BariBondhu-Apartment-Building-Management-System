/**
 * Tests for the building's emergency numbers (SG-06, BR-12, BB-2007).
 *
 * @author Adika Rahman
 */
import type { EmergencyContact } from '@/models';
import {
  listEmergencyNumbers,
  updateEmergencyNumber,
  type EmergencyContactStore,
} from './emergencyContactService';

function contact(overrides: Partial<EmergencyContact>): EmergencyContact {
  return {
    id: 'c-1',
    label: 'Guard desk',
    phone: '01700000111',
    order: 1,
    ...overrides,
  };
}

function storeOf(rows: EmergencyContact[]): EmergencyContactStore {
  return {
    list: jest.fn(async () => rows),
    updateByLabel: jest.fn(async (label, phone) => {
      const row = rows.find((item) => item.label === label);
      return row ? { ...row, phone } : undefined;
    }),
  };
}

describe('listEmergencyNumbers', () => {
  it('returns numbers in the order the manager set', async () => {
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

  it('orders equal positions by label', async () => {
    const numbers = await listEmergencyNumbers(
      storeOf([
        contact({ label: 'Manager', order: 1 }),
        contact({ label: 'Guard desk', order: 1 }),
      ]),
    );

    expect(numbers.map((number) => number.label)).toEqual(['Guard desk', 'Manager']);
  });

  it('does not show an empty number or a second 999', async () => {
    const numbers = await listEmergencyNumbers(
      storeOf([
        contact({ label: 'Empty', phone: '  ' }),
        contact({ label: 'National', phone: '999' }),
        contact({ label: 'Manager', phone: ' 01700000222 ', order: 2 }),
      ]),
    );

    expect(numbers).toEqual([{ label: 'Manager', phone: '01700000222' }]);
  });

  it('returns an empty list when no numbers exist', async () => {
    await expect(listEmergencyNumbers(storeOf([]))).resolves.toEqual([]);
  });

  it('passes on a store failure', async () => {
    const failing: EmergencyContactStore = {
      list: jest.fn(async () => {
        throw new Error('database down');
      }),
      updateByLabel: jest.fn(),
    };

    await expect(listEmergencyNumbers(failing)).rejects.toThrow('database down');
  });
});

describe('updateEmergencyNumber', () => {
  it('updates the Guard desk number', async () => {
    const store = storeOf([contact({})]);

    await expect(updateEmergencyNumber(store, 'Guard desk', '01800000111')).resolves.toEqual({
      label: 'Guard desk',
      phone: '01800000111',
    });

    expect(store.updateByLabel).toHaveBeenCalledWith('Guard desk', '01800000111');
  });

  it('updates the Manager number', async () => {
    const store = storeOf([contact({ label: 'Manager', phone: '01700000222', order: 2 })]);

    await expect(updateEmergencyNumber(store, 'Manager', '01800000222')).resolves.toEqual({
      label: 'Manager',
      phone: '01800000222',
    });
  });

  it('rejects an unknown contact label', async () => {
    const store = storeOf([]);

    await expect(updateEmergencyNumber(store, 'Unknown', '01800000111')).rejects.toThrow(
      'Choose Guard desk or Manager.',
    );

    expect(store.updateByLabel).not.toHaveBeenCalled();
  });

  it('rejects invalid phone numbers and 999', async () => {
    const store = storeOf([contact({})]);

    await expect(updateEmergencyNumber(store, 'Guard desk', '999')).rejects.toThrow(
      'Enter a valid phone number (9 to 11 digits).',
    );

    await expect(updateEmergencyNumber(store, 'Guard desk', 'abc')).rejects.toThrow(
      'Enter a valid phone number (9 to 11 digits).',
    );

    expect(store.updateByLabel).not.toHaveBeenCalled();
  });

  it('returns not found when the contact does not exist', async () => {
    const store = storeOf([]);

    await expect(updateEmergencyNumber(store, 'Manager', '01800000111')).rejects.toThrow(
      'Emergency contact not found.',
    );
  });
});
