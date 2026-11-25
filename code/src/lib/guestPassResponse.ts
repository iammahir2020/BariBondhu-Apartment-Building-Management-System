/**
 * Shapes a guest pass for the resident's guest pass routes (RES-03): what the New guest pass, Pass code and My
 * passes screens show, with dates as ISO strings. The household and the account that made the pass stay on the
 * server.
 *
 * @author Mahir Al Kamal
 */
import type { GuestPassStatus } from '@/services/guestPassStatus';
import type { PassWithStatus } from '@/services/guestPassService';

/** A guest pass as the resident's screens get it. */
export interface GuestPassView {
  id: string;
  guestName: string;
  guestCount: number;
  /** How many guests the guards have checked in so far. */
  guestsUsed: number;
  /** ISO time. */
  startsAt: string;
  /** ISO time. */
  endsAt: string;
  /** The 6-digit code the guests show at the gate. */
  code: string;
  status: GuestPassStatus;
  /** ISO time, or null if it was never cancelled. */
  cancelledAt: string | null;
}

/**
 * The fields of a pass a resident's screen may get.
 * @param row - The pass and its status now.
 * @returns The view.
 */
export function toGuestPassView({ pass, status }: PassWithStatus): GuestPassView {
  return {
    id: pass.id,
    guestName: pass.guestName,
    guestCount: pass.guestCount,
    guestsUsed: pass.guestsUsed,
    startsAt: pass.startsAt.toISOString(),
    endsAt: pass.endsAt.toISOString(),
    code: pass.code,
    status,
    cancelledAt: pass.cancelledAt?.toISOString() ?? null,
  };
}
