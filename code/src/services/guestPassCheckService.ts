/**
 * Guard-side guest pass lookup (SG-02).
 * Checks a six-digit code and returns only the details needed at the gate.
 */

import { AppError } from '@/lib/errors';
import {
  allowsGuestEntry,
  guestPassStatusAt,
  isLiveGuestPassStatus,
  type GuestPassStatus,
  type GuestPassTiming,
} from '@/services/guestPassStatus';

/** Pass information needed by the guard, including its flat location. */
export interface GuestPassCheckRecord extends GuestPassTiming {
  id: string;
  guestName: string;
  blockName: string;
  flatNumber: string;
  createdAt: Date;
}

/** Read-only lookup required by the checking service. */
export interface GuestPassCheckStore {
  /** All passes that have used this code, including historical passes. */
  passesWithCode(code: string): Promise<GuestPassCheckRecord[]>;
}

/** Dependencies required to check a guest pass. */
export interface GuestPassCheckDeps {
  passes: GuestPassCheckStore;
}

/**
 * Result of checking a guest pass, including guest details,
 * remaining allowance and whether check-in is permitted.
 */
export interface GuestPassCheckResult {
  passId: string;
  guestName: string;
  flat: string;
  approvedGuestCount: number;
  remainingGuestCount: number;
  status: GuestPassStatus;
  checkInAllowed: boolean;
  reason: 'Expired' | 'Cancelled' | 'Valid from' | 'Fully used' | null;
  validFrom: Date | null;
}

/** Error shown when no pass matches the entered code. */
export const CHECK_PASS_ERRORS = {
  notFound: 'No pass with this code',
} as const;

/**
 * Checks a guest pass code for the guard (SG-02).
 * If a code has been reused, the current live pass takes priority over historical passes.
 *
 * @param deps - Read-only pass store.
 * @param code - Six-digit guest pass code.
 * @param now - Current time; injectable for tests.
 * @returns The guest and flat details, status, remaining allowance and check-in decision.
 * @throws AppError 404 when no pass matches the code.
 */
export async function checkGuestPass(
  deps: GuestPassCheckDeps,
  code: string,
  now: Date = new Date(),
): Promise<GuestPassCheckResult> {
  const matches = await deps.passes.passesWithCode(code.trim());

  if (matches.length === 0) {
    throw new AppError('NOT_FOUND', CHECK_PASS_ERRORS.notFound);
  }

  const checked = matches.map((pass) => ({
    pass,
    status: guestPassStatusAt(pass, now),
  }));

  // A code can be reused after its previous pass is no longer live.
  const selected =
    checked.find(({ status }) => isLiveGuestPassStatus(status)) ??
    checked.reduce(
      (latest, current) => (current.pass.createdAt > latest.pass.createdAt ? current : latest),
      checked[0]!,
    );

  const { pass, status } = selected;
  const checkInAllowed = allowsGuestEntry(status);

  let reason: GuestPassCheckResult['reason'] = null;
  if (status === 'Scheduled') reason = 'Valid from';
  else if (status === 'Expired') reason = 'Expired';
  else if (status === 'Cancelled') reason = 'Cancelled';
  else if (status === 'Fully used') reason = 'Fully used';

  return {
    passId: pass.id,
    guestName: pass.guestName,
    flat: `${pass.blockName}-${pass.flatNumber}`,
    approvedGuestCount: pass.guestCount,
    remainingGuestCount: Math.max(0, pass.guestCount - pass.guestsUsed),
    status,
    checkInAllowed,
    reason,
    validFrom: status === 'Scheduled' ? pass.startsAt : null,
  };
}
