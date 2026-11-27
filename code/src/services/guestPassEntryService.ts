/**
 * Records guest check-ins against a guest pass (SG-03).
 * The store is responsible for saving the visit and updating guest usage atomically.
 */

import { AppError } from '@/lib/errors';
import type { Visit } from '@/models/Visit';
import type { Notifier } from '@/services/notifier';
import {
  allowsGuestEntry,
  guestPassStatusAt,
  type GuestPassTiming,
} from '@/services/guestPassStatus';

/** Pass information required to validate an entry and notify its resident. */
export interface GuestPassEntryRecord extends GuestPassTiming {
  id: string;
  createdById: string;
}

/** A command for the store to atomically update guest usage and insert a visit. */
export interface RecordEntryCommand {
  passId: string;
  expectedGuestsUsed: number;
  guestsIn: number;
  enteredAt: Date;
  guardId: string;
  enteredLater: boolean;
}

/** Persistence operations required by the entry service. */
export interface GuestPassEntryStore {
  /** Finds a pass by its ID, including the resident who created it. */
  findById(passId: string): Promise<GuestPassEntryRecord | null>;

  /**
   * Atomically increases guestsUsed and inserts the visit.
   * Returns null if the pass changed or no longer has enough allowance.
   */
  recordEntry(command: RecordEntryCommand): Promise<Visit | null>;
}

/** Dependencies required to record a guest entry. */
export interface GuestPassEntryDeps {
  store: GuestPassEntryStore;
  notify: Notifier;
}

/** Details supplied by the guard when recording an entry. */
export interface RecordGuestEntryInput {
  passId: string;
  guardId: string;
  guestsIn: number;
  /** Actual entry time from the paper register, when entering a visit later. */
  enteredAt?: Date;
  /** True when this entry is being copied from the paper register. */
  enteredLater?: boolean;
}

/** Result of a successfully recorded entry. */
export interface RecordGuestEntryResult {
  visit: Visit;
  remainingGuestCount: number;
}

/** Resident page opened by a guest-entry notification. */
export const RESIDENT_GUEST_PASSES_LINK = '/resident/guest-passes';

/**
 * Records a guest entry and notifies the resident after the save succeeds.
 *
 * A paper-register entry is validated at its actual entry time, not the time
 * it is entered into the system.
 *
 * @param deps - Store and notification dependencies.
 * @param input - Pass, guard, guest count and optional paper-register details.
 * @param now - Current time, injectable for tests.
 * @returns The saved visit and the remaining guest allowance.
 * @throws AppError when the pass is missing, invalid, or has insufficient allowance.
 */
export async function recordGuestEntry(
  deps: GuestPassEntryDeps,
  input: RecordGuestEntryInput,
  now: Date = new Date(),
): Promise<RecordGuestEntryResult> {
  if (!Number.isInteger(input.guestsIn) || input.guestsIn <= 0) {
    throw new AppError('BAD_REQUEST', 'Enter a valid number of guests.');
  }
  if (input.enteredLater && !input.enteredAt) {
    throw new AppError('BAD_REQUEST', 'The actual entry time is required.');
  }

  if (!input.enteredLater && input.enteredAt !== undefined) {
    throw new AppError(
      'BAD_REQUEST',
      'An actual entry time can only be supplied for a paper-register entry.',
    );
  }

  const enteredAt = input.enteredAt ?? now;
  if (Number.isNaN(enteredAt.getTime())) {
    throw new AppError('BAD_REQUEST', 'Check the entry time.');
  }

  const pass = await deps.store.findById(input.passId);

  if (!pass) {
    throw new AppError('NOT_FOUND', 'No pass with this ID');
  }

  const remainingGuestCount = Math.max(0, pass.guestCount - pass.guestsUsed);
  const status = guestPassStatusAt(pass, enteredAt);

  if (!allowsGuestEntry(status)) {
    const reason =
      status === 'Scheduled' ? 'Valid from' : status === 'Fully used' ? 'Fully used' : status;

    throw new AppError('FORBIDDEN', 'Pass not valid', {
      reason,
      remainingGuestCount,
    });
  }

  if (input.guestsIn > remainingGuestCount) {
    throw new AppError('BAD_REQUEST', 'The number of guests exceeds the remaining allowance.', {
      remainingGuestCount,
    });
  }

  const visit = await deps.store.recordEntry({
    passId: pass.id,
    expectedGuestsUsed: pass.guestsUsed,
    guestsIn: input.guestsIn,
    enteredAt,
    guardId: input.guardId,
    enteredLater: input.enteredLater ?? false,
  });

  if (!visit) {
    throw new AppError(
      'CONFLICT',
      'The guest pass changed. Check it again before recording entry.',
    );
  }

  const remainingAfterEntry = remainingGuestCount - input.guestsIn;
  const guestWord = input.guestsIn === 1 ? 'guest' : 'guests';
  const verb = input.guestsIn === 1 ? 'has' : 'have';

  try {
    await deps.notify({
      recipientId: pass.createdById,
      text: `${input.guestsIn} ${guestWord} ${verb} arrived for your guest pass.`,
      link: RESIDENT_GUEST_PASSES_LINK,
    });
  } catch (error) {
    // The entry is already saved. A notification failure must not undo it.
    console.error('Could not notify the resident about guest entry', error);
  }

  return {
    visit,
    remainingGuestCount: remainingAfterEntry,
  };
}
