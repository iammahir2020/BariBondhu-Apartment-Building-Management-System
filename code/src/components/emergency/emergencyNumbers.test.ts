/**
 * Tests for the Emergency screen helpers: number format, dial links, and the copy kept on the device (SG-06).
 *
 * @author Mahir Al Kamal
 */
import {
  EMERGENCY_CACHE_KEY,
  formatPhone,
  loadNumbers,
  saveNumbers,
  telHref,
  type NumberStorage,
} from './emergencyNumbers';

function memoryStorage(initial: Record<string, string> = {}): NumberStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('formatPhone', () => {
  it('puts a dash after the operator code of a mobile number (normal)', () => {
    expect(formatPhone('01700000111')).toBe('01700-000111');
  });

  it('leaves 999 and other numbers alone (boundary)', () => {
    expect(formatPhone('999')).toBe('999');
    expect(formatPhone('029661234')).toBe('029661234');
  });
});

describe('telHref', () => {
  it('dials the digits only (normal)', () => {
    expect(telHref('01700-000 111')).toBe('tel:01700000111');
    expect(telHref('+8801700000111')).toBe('tel:+8801700000111');
  });
});

describe('saveNumbers and loadNumbers', () => {
  const NUMBERS = [{ label: 'Guard desk', phone: '01700000111' }];
  const NOW = new Date('2026-11-26T09:00:00Z');

  it('reads back what was saved, with the time (normal)', () => {
    const storage = memoryStorage();
    saveNumbers(storage, NUMBERS, NOW);
    expect(loadNumbers(storage)).toEqual({ numbers: NUMBERS, savedAt: NOW.toISOString() });
  });

  it('has nothing before the first load (boundary)', () => {
    expect(loadNumbers(memoryStorage())).toBeNull();
  });

  it('ignores a damaged or unexpected copy (invalid input)', () => {
    expect(loadNumbers(memoryStorage({ [EMERGENCY_CACHE_KEY]: '{not json' }))).toBeNull();
    expect(
      loadNumbers(
        memoryStorage({ [EMERGENCY_CACHE_KEY]: '{"numbers":[{"label":1}],"savedAt":"x"}' }),
      ),
    ).toBeNull();
    expect(loadNumbers(memoryStorage({ [EMERGENCY_CACHE_KEY]: '{"numbers":[]}' }))).toBeNull();
  });

  it('keeps working when storage is full or blocked (exception)', () => {
    const blocked: NumberStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveNumbers(blocked, NUMBERS, NOW)).not.toThrow();
    expect(loadNumbers(blocked)).toBeNull();
  });
});
