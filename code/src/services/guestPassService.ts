/**
 * Business rules for a resident's guest passes (RES-03, BR-11): create a pass for 1 to 20 guests over at most 24
 * hours, with a 6-digit code that no live pass has; cancel one while it is still live; and list my household's
 * passes with their status now. Wording from RES-03 and the Decisions in `docs/test-cases.md`.
 *
 * A pass may start in the past as long as it hasn't ended, so guests already at the gate can be let in; it is Active
 * at once (Decision 4). Codes are drawn from a secure random source, never `Math.random`, so they can't be guessed
 * (TC-R03-13).
 *
 * @author Mahir Al Kamal
 */
import { randomInt, randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { GuestPass, Profile } from '@/models';
import type { RandomInt } from '@/services/accountService';
import type { AuditWriter } from '@/services/auditService';
import {
  guestPassStatusAt,
  isLiveGuestPassStatus,
  type GuestPassStatus,
  type GuestPassTiming,
} from '@/services/guestPassStatus';

/** Fewest guests on one pass (RES-03). */
export const MIN_GUESTS = 1;

/** Most guests on one pass (RES-03). */
export const MAX_GUESTS = 20;

/** Longest visit window: 24 hours (BR-11). */
export const MAX_PASS_HOURS = 24;

/** How many codes to draw before giving up. With 1,000,000 codes a clash is already rare. */
const CODE_TRIES = 10;

/** Error text for each rule a new pass can break. */
export const PASS_ERRORS = {
  guestName: "Enter the guest's name",
  guestCount: 'Enter 1 to 20 guests',
  times: 'Check the visit times',
  household: 'Only a household account can create a guest pass.',
  noCode: 'Could not make a pass code. Please try again.',
} as const;

/** Error text for cancelling a pass. */
export const CANCEL_PASS_ERRORS = {
  notFound: 'This guest pass does not exist.',
  notYours: "This isn't your household's pass.",
  Cancelled: 'This pass is already cancelled.',
  Expired: 'This pass has already expired.',
  'Fully used': 'Every guest on this pass has already come in.',
  changed: 'This pass just changed. Please reload and try again.',
} as const;

/** What a resident fills in on the New guest pass screen. */
export interface NewPassInput {
  guestName: string;
  /** How many people are coming. Anything but a whole number from 1 to 20 is refused. */
  guestCount: number;
  /** Start and end of the visit; null when the form left them empty. */
  startsAt: Date | null;
  endsAt: Date | null;
}

/** A pass with its status at a given time. A new one is Scheduled, or Active if it has already started. */
export interface PassWithStatus {
  pass: GuestPass;
  status: GuestPassStatus;
}

/** The guest pass reads and writes the service needs. */
export interface GuestPassStore {
  /** The flat of an occupancy that hasn't ended, or null if it has ended or doesn't exist. */
  activeFlatOf(occupancyId: string): Promise<string | null>;
  /** Every pass that has ever had this code, in any state. */
  passesWithCode(code: string): Promise<GuestPassTiming[]>;
  /** Saves a new pass. */
  insert(pass: GuestPass): Promise<void>;
  /** One pass by id, or null if there is none. */
  findById(id: string): Promise<GuestPass | null>;
  /** Every pass of one household (occupancy), in any state. */
  listForOccupancy(occupancyId: string): Promise<GuestPass[]>;
  /**
   * Sets the cancellation time, but only if the pass is still live at that time: not cancelled, not past its end and
   * not fully used. Checking again in the same write means a guard's check-in or the end time can't slip in between.
   * @returns Whether the pass was cancelled.
   */
  cancelIfLive(id: string, at: Date): Promise<boolean>;
}

/** What the guest pass service works with. */
export interface GuestPassDeps {
  passes: GuestPassStore;
  audit: AuditWriter;
  /** Makes ids; tests pass a fixed one. */
  newId?: () => string;
  /** Source of randomness for codes; secure by default, tests pass a fixed one. */
  random?: RandomInt;
}

/**
 * A 6-digit pass code, leading zeros kept ("004271").
 * @param random - Source of randomness: a number from 0 up to, not including, the maximum.
 * @returns The code.
 */
export function drawPassCode(random: RandomInt = (max) => randomInt(max)): string {
  return String(random(1_000_000)).padStart(6, '0');
}

/** Whether a Date is a real moment, not an Invalid Date. */
function isValidDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Creates a guest pass for my household (RES-03). The visit window is from start to end, at most 24 hours, and may
 * cross midnight; its end must still be ahead (BR-11). The code is unique among passes that are Scheduled, Active or
 * Partly used; an Expired, Cancelled or Fully used pass's code may come round again (TC-R03-11, TC-R03-12).
 * @param deps - Pass store, audit writer, and optionally ids and randomness.
 * @param resident - The signed-in resident.
 * @param input - Guest name, number of guests, start and end.
 * @param now - The current time.
 * @returns The pass and its status now.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 * @throws AppError 400 "Enter the guest's name", "Enter 1 to 20 guests" or "Check the visit times".
 * @throws AppError 500 if no free code was found after several draws.
 */
export async function createGuestPass(
  deps: GuestPassDeps,
  resident: Profile,
  input: NewPassInput,
  now: Date = new Date(),
): Promise<PassWithStatus> {
  const occupancyId = await householdOf(deps.passes, resident);

  const guestName = input.guestName.trim();
  if (guestName === '') throw new AppError('BAD_REQUEST', PASS_ERRORS.guestName);
  const { guestCount } = input;
  if (!Number.isInteger(guestCount) || guestCount < MIN_GUESTS || guestCount > MAX_GUESTS) {
    throw new AppError('BAD_REQUEST', PASS_ERRORS.guestCount);
  }
  const { startsAt, endsAt } = input;
  if (!isValidDate(startsAt) || !isValidDate(endsAt)) {
    throw new AppError('BAD_REQUEST', PASS_ERRORS.times);
  }
  const length = endsAt.getTime() - startsAt.getTime();
  if (length <= 0 || length > MAX_PASS_HOURS * 60 * 60 * 1000 || endsAt <= now) {
    throw new AppError('BAD_REQUEST', PASS_ERRORS.times);
  }

  let code: string | undefined;
  for (let i = 0; i < CODE_TRIES && code === undefined; i += 1) {
    const candidate = drawPassCode(deps.random);
    const holders = await deps.passes.passesWithCode(candidate);
    const taken = holders.some((p) => isLiveGuestPassStatus(guestPassStatusAt(p, now)));
    if (!taken) code = candidate;
  }
  if (code === undefined) throw new AppError('INTERNAL', PASS_ERRORS.noCode);

  const pass: GuestPass = {
    id: (deps.newId ?? randomUUID)(),
    occupancyId,
    createdById: resident.id,
    guestName,
    guestCount,
    startsAt,
    endsAt,
    code,
    guestsUsed: 0,
    cancelledAt: null,
    createdAt: now,
  };
  await deps.passes.insert(pass);
  await deps.audit({
    actorId: resident.id,
    action: 'guest_pass.create',
    entityType: 'guest_passes',
    entityId: pass.id,
    oldValues: null,
    newValues: { guestCount, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
  });
  return { pass, status: guestPassStatusAt(pass, now) };
}

/**
 * The resident's household, checked to be still living in the building.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 */
async function householdOf(passes: GuestPassStore, resident: Profile): Promise<string> {
  const occupancyId = resident.occupancyId;
  if (resident.role !== 'resident' || occupancyId === null) {
    throw new AppError('FORBIDDEN', PASS_ERRORS.household);
  }
  if ((await passes.activeFlatOf(occupancyId)) === null) {
    throw new AppError('FORBIDDEN', PASS_ERRORS.household);
  }
  return occupancyId;
}

/** The message for a pass that can't be cancelled because of its status. */
function cannotCancelMessage(status: GuestPassStatus): string {
  if (status === 'Cancelled' || status === 'Expired' || status === 'Fully used') {
    return CANCEL_PASS_ERRORS[status];
  }
  return CANCEL_PASS_ERRORS.changed;
}

/**
 * Cancels one of my household's passes (RES-03 c4). Only a Scheduled, Active or Partly used pass can be cancelled
 * (TC-R03-19); it is Cancelled from `now`, so the code stops working for new entries at once. Guests already inside
 * can still be checked out: that is the guard's check-out, which cancelling doesn't touch (BR-11).
 * @param deps - Pass store and audit writer.
 * @param resident - The signed-in resident.
 * @param passId - The pass to cancel.
 * @param now - The current time.
 * @returns The pass, now Cancelled.
 * @throws AppError 403 if the account has no household, the household has moved out, or the pass is another
 *   household's (TC-R03-23).
 * @throws AppError 404 if there is no such pass.
 * @throws AppError 409 if the pass is already Cancelled, Expired or Fully used (TC-R03-20).
 */
export async function cancelGuestPass(
  deps: Pick<GuestPassDeps, 'passes' | 'audit'>,
  resident: Profile,
  passId: string,
  now: Date = new Date(),
): Promise<PassWithStatus> {
  const occupancyId = await householdOf(deps.passes, resident);
  const pass = await deps.passes.findById(passId);
  if (!pass) throw new AppError('NOT_FOUND', CANCEL_PASS_ERRORS.notFound);
  if (pass.occupancyId !== occupancyId) {
    throw new AppError('FORBIDDEN', CANCEL_PASS_ERRORS.notYours);
  }

  const before = guestPassStatusAt(pass, now);
  if (!isLiveGuestPassStatus(before)) {
    throw new AppError('CONFLICT', cannotCancelMessage(before), { status: before });
  }
  if (!(await deps.passes.cancelIfLive(passId, now))) {
    // Something changed between the read and the write: the last guest came in, or the end time passed.
    const latest = (await deps.passes.findById(passId)) ?? pass;
    const status = guestPassStatusAt(latest, now);
    throw new AppError('CONFLICT', cannotCancelMessage(status), { status });
  }

  await deps.audit({
    actorId: resident.id,
    action: 'guest_pass.cancel',
    entityType: 'guest_passes',
    entityId: passId,
    oldValues: { status: before },
    newValues: { status: 'Cancelled' },
  });
  const cancelled: GuestPass = { ...pass, cancelledAt: now };
  return { pass: cancelled, status: guestPassStatusAt(cancelled, now) };
}

/**
 * My household's passes, each with its status now, the latest start first (TC-R03-21). Only the current
 * household's: a new household in the same flat never sees an earlier one's passes, because they belong to the
 * earlier occupancy (BR-09, TC-R03-22).
 * @param passes - The pass store.
 * @param resident - The signed-in resident.
 * @param now - The current time.
 * @returns The passes with their status.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 */
export async function listMyGuestPasses(
  passes: GuestPassStore,
  resident: Profile,
  now: Date = new Date(),
): Promise<PassWithStatus[]> {
  const occupancyId = await householdOf(passes, resident);
  const rows = await passes.listForOccupancy(occupancyId);
  return rows
    .map((pass) => ({ pass, status: guestPassStatusAt(pass, now) }))
    .sort((a, b) => b.pass.startsAt.getTime() - a.pass.startsAt.getTime());
}

/**
 * One of my household's passes with its status now, for the Pass code screen (RES-03 c1 and c3): the code and QR
 * code to share, and how many guests have come in.
 * @param passes - The pass store.
 * @param resident - The signed-in resident.
 * @param passId - The pass to show.
 * @param now - The current time.
 * @returns The pass with its status.
 * @throws AppError 403 if the account has no household, the household has moved out, or the pass is another
 *   household's (TC-R03-23).
 * @throws AppError 404 if there is no such pass.
 */
export async function getMyGuestPass(
  passes: GuestPassStore,
  resident: Profile,
  passId: string,
  now: Date = new Date(),
): Promise<PassWithStatus> {
  const occupancyId = await householdOf(passes, resident);
  const pass = await passes.findById(passId);
  if (!pass) throw new AppError('NOT_FOUND', CANCEL_PASS_ERRORS.notFound);
  if (pass.occupancyId !== occupancyId)
    throw new AppError('FORBIDDEN', CANCEL_PASS_ERRORS.notYours);
  return { pass, status: guestPassStatusAt(pass, now) };
}
