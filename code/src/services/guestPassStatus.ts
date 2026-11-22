/**
 * The status of a guest pass at a given moment (RES-03, SG-02, BR-11). I don't store the status: it follows from the
 * pass's times, how many guests have come in, and whether it was cancelled, so it can't go stale when the end time
 * passes. The guest pass service (feature 16) and the guard's pass check (feature 17) both call
 * {@link guestPassStatusAt}. If you need a change here, ask me (Mahir) rather than editing it in your own PR.
 *
 * It follows the guest pass state diagram in `docs/sds/design-inputs-from-srs.md`: Scheduled → Active → Partly used
 * → Fully used; Scheduled, Active or Partly used → Cancelled or Expired. Fully used has no way out, so a Fully used
 * pass stays Fully used after its end time.
 *
 * @author Mahir Al Kamal
 */

/** The six guest pass states, word for word from the state diagram. */
export const GUEST_PASS_STATUSES = [
  'Scheduled',
  'Active',
  'Partly used',
  'Fully used',
  'Cancelled',
  'Expired',
] as const;

/** One of the six guest pass states. */
export type GuestPassStatus = (typeof GUEST_PASS_STATUSES)[number];

/** The parts of a guest pass its status depends on. A GuestPass row has all of them. */
export interface GuestPassTiming {
  /** Start of the visit window. */
  readonly startsAt: Date;
  /** End of the visit window, at most 24 hours after the start (BR-11). */
  readonly endsAt: Date;
  /** How many guests the pass is for (1 to 20). */
  readonly guestCount: number;
  /** How many guests the guards have checked in so far. */
  readonly guestsUsed: number;
  /** When the resident cancelled it, or when its occupancy ended; empty if it was never cancelled. */
  readonly cancelledAt: Date | null;
}

/** States whose code is still taken: a new pass can't get the same code (BR-11), and the resident can cancel it. */
export const LIVE_GUEST_PASS_STATUSES: readonly GuestPassStatus[] = [
  'Scheduled',
  'Active',
  'Partly used',
];

/** States in which the guard can check guests in (SG-02, SG-03). */
export const ENTRY_GUEST_PASS_STATUSES: readonly GuestPassStatus[] = ['Active', 'Partly used'];

/**
 * Works out a pass's status at a moment. The start time already counts as Active and the end time already counts
 * as Expired. A cancellation counts from its own time on, so asking about an earlier moment gives the status the
 * pass had then.
 * @param pass - The pass, or any object with its times, guest count, guests used and cancellation time.
 * @param at - The moment to ask about, usually now.
 * @returns The pass's status at that moment.
 */
export function guestPassStatusAt(pass: GuestPassTiming, at: Date): GuestPassStatus {
  const now = at.getTime();
  if (pass.cancelledAt !== null && now >= pass.cancelledAt.getTime()) return 'Cancelled';
  if (pass.guestsUsed >= pass.guestCount) return 'Fully used';
  if (now >= pass.endsAt.getTime()) return 'Expired';
  if (now < pass.startsAt.getTime()) return 'Scheduled';
  return pass.guestsUsed > 0 ? 'Partly used' : 'Active';
}

/**
 * Whether a pass in this status still holds its code and can be cancelled.
 * @param status - The pass's current status.
 * @returns `true` for Scheduled, Active and Partly used.
 */
export function isLiveGuestPassStatus(status: GuestPassStatus): boolean {
  return LIVE_GUEST_PASS_STATUSES.includes(status);
}

/**
 * Whether the guard can check guests in on a pass in this status.
 * @param status - The pass's current status.
 * @returns `true` for Active and Partly used.
 */
export function allowsGuestEntry(status: GuestPassStatus): boolean {
  return ENTRY_GUEST_PASS_STATUSES.includes(status);
}
