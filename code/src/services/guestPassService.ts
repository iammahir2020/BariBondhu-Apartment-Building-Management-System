/**
 * Business rules for a resident's guest passes (RES-03, BR-11): create a pass for 1 to 20 guests over at most 24
 * hours, with a 6-digit code that no live pass has. Wording from RES-03 and the Decisions in `docs/test-cases.md`.
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

/** What a resident fills in on the New guest pass screen. */
export interface NewPassInput {
  guestName: string;
  /** How many people are coming. Anything but a whole number from 1 to 20 is refused. */
  guestCount: number;
  /** Start and end of the visit; null when the form left them empty. */
  startsAt: Date | null;
  endsAt: Date | null;
}

/** A new pass, with its status when it was made (Scheduled, or Active if it has already started). */
export interface CreatedPass {
  pass: GuestPass;
  status: GuestPassStatus;
}

/** The guest pass reads and writes creating a pass needs. */
export interface GuestPassStore {
  /** The flat of an occupancy that hasn't ended, or null if it has ended or doesn't exist. */
  activeFlatOf(occupancyId: string): Promise<string | null>;
  /** Every pass that has ever had this code, in any state. */
  passesWithCode(code: string): Promise<GuestPassTiming[]>;
  /** Saves a new pass. */
  insert(pass: GuestPass): Promise<void>;
}

/** What {@link createGuestPass} works with. */
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
): Promise<CreatedPass> {
  const occupancyId = resident.occupancyId;
  if (resident.role !== 'resident' || occupancyId === null) {
    throw new AppError('FORBIDDEN', PASS_ERRORS.household);
  }
  if ((await deps.passes.activeFlatOf(occupancyId)) === null) {
    throw new AppError('FORBIDDEN', PASS_ERRORS.household);
  }

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
