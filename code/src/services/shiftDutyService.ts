/**
 * Business rules for the manager's seven-day duty list and a guard's own shifts (BM-09, SG-05).
 *
 * The seven-day window uses Dhaka calendar days, including today. Overnight shifts remain continuous
 * intervals, and removed shifts do not count as assigned coverage.
 *
 * @author Tawhid Bin Moslim
 */
import type { Shift } from '@/models';

/** One uncovered interval in the manager's duty list. */
export interface DutyGap {
  startsAt: Date;
  endsAt: Date;
}

/** The shifts and uncovered intervals shown to the building manager. */
export interface ManagerDutyList {
  startsAt: Date;
  endsAt: Date;
  shifts: Shift[];
  gaps: DutyGap[];
}

/** The shifts shown to one guard. */
export interface GuardDutyList {
  shifts: Shift[];
  noShiftToday: boolean;
}

/** The shift reads required by this service. */
export interface ShiftDutyStore {
  /** Finds all shifts overlapping the requested interval. */
  listOverlapping(startsAt: Date, endsAt: Date): Promise<Shift[]>;

  /** Finds one guard's shifts overlapping the requested interval. */
  listOverlappingForGuard(guardId: string, startsAt: Date, endsAt: Date): Promise<Shift[]>;
}

/** Dependencies required by the duty-list service. */
export interface ShiftDutyDeps {
  shifts: ShiftDutyStore;
}

/** Bangladesh uses UTC+6. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUTY_WINDOW_DAYS = 7;

/**
 * Gets the start of today in Dhaka as a Date.
 *
 * @param now - The current time.
 * @returns Midnight at the start of today in Dhaka.
 */
function dhakaDayStart(now: Date): Date {
  const dhakaNow = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const utcMidnight = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    dhakaNow.getUTCDate(),
  );

  return new Date(utcMidnight - DHAKA_OFFSET_MS);
}

/**
 * Sorts shifts by start time without changing the original array.
 *
 * @param shifts - The shifts to sort.
 * @returns A new array in chronological order.
 */
function sortShifts(shifts: readonly Shift[]): Shift[] {
  return shifts
    .filter((shift) => shift.status !== 'Removed')
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Finds uncovered intervals in a duty window.
 *
 * Overlapping shifts are merged for coverage calculation. Shifts crossing either
 * boundary are clipped to the requested window.
 *
 * @param shifts - The shifts that may cover the window.
 * @param startsAt - The beginning of the window.
 * @param endsAt - The end of the window.
 * @returns Uncovered intervals in chronological order.
 */
export function findDutyGaps(shifts: readonly Shift[], startsAt: Date, endsAt: Date): DutyGap[] {
  const start = startsAt.getTime();
  const end = endsAt.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new RangeError('The duty window must have valid dates and end after it starts.');
  }

  const intervals = shifts
    .filter((shift) => shift.status !== 'Removed')
    .map((shift) => ({
      start: Math.max(start, shift.startsAt.getTime()),
      end: Math.min(end, shift.endsAt.getTime()),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  const gaps: DutyGap[] = [];
  let coveredUntil = start;

  for (const interval of intervals) {
    if (interval.start > coveredUntil) {
      gaps.push({
        startsAt: new Date(coveredUntil),
        endsAt: new Date(interval.start),
      });
    }

    coveredUntil = Math.max(coveredUntil, interval.end);

    if (coveredUntil >= end) break;
  }

  if (coveredUntil < end) {
    gaps.push({
      startsAt: new Date(coveredUntil),
      endsAt: new Date(end),
    });
  }

  return gaps;
}

/**
 * Builds the manager's duty list for today and the following six Dhaka calendar days.
 *
 * @param deps - The shift store.
 * @param now - The current time.
 * @returns The shifts and all uncovered intervals in the seven-day window.
 */
export async function getManagerDutyList(deps: ShiftDutyDeps, now: Date): Promise<ManagerDutyList> {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('The current time must be a valid date.');
  }

  const startsAt = dhakaDayStart(now);
  const endsAt = new Date(startsAt.getTime() + DUTY_WINDOW_DAYS * DAY_MS);

  const shifts = sortShifts(await deps.shifts.listOverlapping(startsAt, endsAt));

  return {
    startsAt,
    endsAt,
    shifts,
    gaps: findDutyGaps(shifts, startsAt, endsAt),
  };
}

/**
 * Lists one guard's shifts for the seven-day window.
 *
 * If none of the guard's non-removed shifts overlaps any part of today in Dhaka,
 * the result tells the caller to display "No shift today".
 *
 * @param deps - The shift store.
 * @param guardId - The guard's profile ID.
 * @param now - The current time.
 * @returns The guard's shifts and whether there is no shift today.
 */
export async function getMyDutyList(
  deps: ShiftDutyDeps,
  guardId: string,
  now: Date,
): Promise<GuardDutyList> {
  if (!guardId.trim()) {
    throw new Error('A guard ID is required.');
  }

  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('The current time must be a valid date.');
  }

  const startsAt = dhakaDayStart(now);
  const endsAt = new Date(startsAt.getTime() + DUTY_WINDOW_DAYS * DAY_MS);

  const shifts = sortShifts(await deps.shifts.listOverlappingForGuard(guardId, startsAt, endsAt));

  const todayEndsAt = new Date(startsAt.getTime() + DAY_MS);
  const hasShiftToday = shifts.some(
    (shift) =>
      shift.startsAt.getTime() < todayEndsAt.getTime() &&
      shift.endsAt.getTime() > startsAt.getTime(),
  );

  return {
    shifts,
    noShiftToday: !hasShiftToday,
  };
}
