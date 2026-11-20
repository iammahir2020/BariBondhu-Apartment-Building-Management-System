/**
 * Shared fakes for service tests: a profile builder and in-memory stores, so tests run without a database or
 * Supabase. Only test files import this.
 *
 * @author Mahir Al Kamal
 */
import type { NewAuditLog, Profile } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import type { AttemptState, LoginAttemptStore } from '@/services/authService';

/**
 * A profile with sensible defaults: an active manager who has already chosen a password.
 * @param overrides - Fields to change.
 * @returns The profile.
 */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    username: 'bb-4k7q2m',
    role: 'manager',
    displayName: 'Nasrin Sultana',
    phone: null,
    email: null,
    occupancyId: null,
    mustChangePassword: false,
    tempPasswordExpiresAt: null,
    active: true,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

/** An in-memory {@link LoginAttemptStore} whose rows tests can read. */
export class MemoryAttemptStore implements LoginAttemptStore {
  readonly rows = new Map<string, AttemptState>();

  async get(key: string): Promise<AttemptState | undefined> {
    return this.rows.get(key);
  }

  async save(key: string, state: AttemptState): Promise<void> {
    this.rows.set(key, { ...state });
  }

  async clear(key: string): Promise<void> {
    this.rows.delete(key);
  }
}

/**
 * An {@link AuditWriter} that keeps entries in an array.
 * @returns The writer and the entries it collected.
 */
export function memoryAudit(): { audit: AuditWriter; entries: NewAuditLog[] } {
  const entries: NewAuditLog[] = [];
  return {
    entries,
    audit: async (entry) => {
      entries.push(entry);
    },
  };
}
