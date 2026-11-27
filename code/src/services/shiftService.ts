/**
 * Business rules for planning a security guard's shift (BM-09).
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import { AppError } from '@/lib/errors';
import type { NewShift, Profile, Shift } from '@/models';

/** The guard details needed to check whether a shift can be assigned. */
export type ShiftGuard = Pick<Profile, 'id' | 'role' | 'active'>;

/** The shift details needed for overlap validation. */
export type ExistingShift = Pick<Shift, 'startsAt' | 'endsAt' | 'status'>;

/** The reads and writes required by the shift service. */
export interface ShiftStore {
  /** Finds a guard profile by ID, or returns null when it does not exist. */
  findGuard(guardId: string): Promise<ShiftGuard | null>;

  /** Lists the shifts assigned to a guard. */
  listForGuard(guardId: string): Promise<ExistingShift[]>;

  /** Saves a new shift. */
  create(input: NewShift): Promise<Shift>;
}

/** Dependencies required by the shift service. */
export interface ShiftDeps {
  shifts: ShiftStore;
}

/** Input required to plan a shift. */
export interface PlanShiftInput {
  guardId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Maximum permitted shift duration: 24 hours. */
const MAX_SHIFT_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Plans a shift for an active security guard.
 *
 * The shift may cross midnight, but its duration cannot exceed 24 hours.
 * A guard cannot have overlapping shifts. Removed shifts are ignored.
 *
 * @param deps - Shift store dependency.
 * @param input - Guard ID and scheduled start and end date-times.
 * @returns The saved shift.
 * @throws AppError when the guard is invalid, the times are invalid, or a shift overlaps.
 */
export async function planShift(
  deps: Pick<ShiftDeps, 'shifts'>,
  input: PlanShiftInput,
): Promise<Shift> {
  const { guardId, startsAt, endsAt } = input;

  const startTime = startsAt instanceof Date ? startsAt.getTime() : Number.NaN;
  const endTime = endsAt instanceof Date ? endsAt.getTime() : Number.NaN;
  const duration = endTime - startTime;

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    duration <= 0 ||
    duration > MAX_SHIFT_DURATION_MS
  ) {
    throw new AppError('BAD_REQUEST', 'Check the shift times');
  }

  const guard = await deps.shifts.findGuard(guardId);

  if (!guard || guard.role !== 'guard' || !guard.active) {
    throw new AppError('NOT_FOUND', 'An active guard account was not found.');
  }

  const existingShifts = await deps.shifts.listForGuard(guardId);

  const overlaps = existingShifts.some((existing) => {
    if (existing.status === 'Removed') return false;

    const existingStart = existing.startsAt.getTime();
    const existingEnd = existing.endsAt.getTime();

    return startTime < existingEnd && endTime > existingStart;
  });

  if (overlaps) {
    throw new AppError('CONFLICT', 'This guard already has a shift then');
  }

  return deps.shifts.create({
    guardId,
    startsAt,
    endsAt,
  });
}
