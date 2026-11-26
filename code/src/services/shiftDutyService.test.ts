/**
 * Tests for the manager's seven-day duty list and a guard's own shifts (BM-09, SG-05).
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import type { Shift } from '@/models';
import {
  findDutyGaps,
  getManagerDutyList,
  getMyDutyList,
  type ShiftDutyDeps,
  type ShiftDutyStore,
} from './shiftDutyService';

/** 26 Nov 2026, 3 pm in Dhaka. */
const NOW = new Date('2026-11-26T09:00:00.000Z');
const TODAY_START = new Date('2026-11-25T18:00:00.000Z');
const TODAY_END = new Date('2026-11-26T18:00:00.000Z');
const WINDOW_END = new Date('2026-12-02T18:00:00.000Z');

function shift(
  id: string,
  startsAt: string,
  endsAt: string,
  status: Shift['status'] = 'Planned',
  guardId = 'guard-1',
): Shift {
  return {
    id,
    guardId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
  };
}

function store(overrides: Partial<ShiftDutyStore> = {}): ShiftDutyDeps {
  return {
    shifts: {
      listOverlapping: jest.fn(async () => []),
      listOverlappingForGuard: jest.fn(async () => []),
      ...overrides,
    },
  };
}

describe('findDutyGaps', () => {
  it('returns the whole window as a gap when there are no shifts', () => {
    expect(findDutyGaps([], TODAY_START, WINDOW_END)).toEqual([
      { startsAt: TODAY_START, endsAt: WINDOW_END },
    ]);
  });

  it('finds gaps before, between and after shifts', () => {
    const shifts = [
      shift('1', '2026-11-26T00:00:00Z', '2026-11-26T04:00:00Z'),
      shift('2', '2026-11-26T06:00:00Z', '2026-11-26T08:00:00Z'),
    ];

    expect(findDutyGaps(shifts, TODAY_START, TODAY_END)).toEqual([
      { startsAt: TODAY_START, endsAt: new Date('2026-11-26T00:00:00Z') },
      {
        startsAt: new Date('2026-11-26T04:00:00Z'),
        endsAt: new Date('2026-11-26T06:00:00Z'),
      },
      { startsAt: new Date('2026-11-26T08:00:00Z'), endsAt: TODAY_END },
    ]);
  });

  it('merges overlapping shifts so they do not create false gaps', () => {
    const shifts = [
      shift('1', '2026-11-25T18:00:00Z', '2026-11-26T02:00:00Z'),
      shift('2', '2026-11-26T01:00:00Z', '2026-11-26T10:00:00Z'),
    ];

    expect(findDutyGaps(shifts, TODAY_START, TODAY_END)).toEqual([
      { startsAt: new Date('2026-11-26T10:00:00Z'), endsAt: TODAY_END },
    ]);
  });

  it('ignores removed shifts when calculating coverage', () => {
    const shifts = [shift('1', '2026-11-25T18:00:00Z', '2026-11-26T18:00:00Z', 'Removed')];

    expect(findDutyGaps(shifts, TODAY_START, TODAY_END)).toEqual([
      { startsAt: TODAY_START, endsAt: TODAY_END },
    ]);
  });

  it('clips shifts that begin before or end after the window', () => {
    const shifts = [
      shift('1', '2026-11-25T17:00:00Z', '2026-11-26T00:00:00Z'),
      shift('2', '2026-11-26T12:00:00Z', '2026-11-26T19:00:00Z'),
    ];

    expect(findDutyGaps(shifts, TODAY_START, TODAY_END)).toEqual([
      {
        startsAt: new Date('2026-11-26T00:00:00Z'),
        endsAt: new Date('2026-11-26T12:00:00Z'),
      },
    ]);
  });

  it('allows adjacent shifts without creating a gap', () => {
    const shifts = [
      shift('1', '2026-11-25T18:00:00Z', '2026-11-26T06:00:00Z'),
      shift('2', '2026-11-26T06:00:00Z', '2026-11-26T18:00:00Z'),
    ];

    expect(findDutyGaps(shifts, TODAY_START, TODAY_END)).toEqual([]);
  });

  it('rejects an invalid duty window', () => {
    expect(() => findDutyGaps([], TODAY_END, TODAY_START)).toThrow(RangeError);
  });
});

describe('getManagerDutyList', () => {
  it('uses seven Dhaka calendar days and returns sorted, non-removed shifts', async () => {
    const later = shift('2', '2026-11-27T08:00:00Z', '2026-11-27T12:00:00Z');
    const earlier = shift('1', '2026-11-26T00:00:00Z', '2026-11-26T04:00:00Z');
    const removed = shift('3', '2026-11-26T05:00:00Z', '2026-11-26T07:00:00Z', 'Removed');

    const deps = store({
      listOverlapping: jest.fn(async () => [later, removed, earlier]),
    });

    const result = await getManagerDutyList(deps, NOW);

    expect(deps.shifts.listOverlapping).toHaveBeenCalledWith(TODAY_START, WINDOW_END);
    expect(result.startsAt).toEqual(TODAY_START);
    expect(result.endsAt).toEqual(WINDOW_END);
    expect(result.shifts).toEqual([earlier, later]);
    expect(result.shifts).not.toContain(removed);
  });

  it('uses Dhaka midnight even when UTC is still on the previous date', async () => {
    const beforeDhakaMidnight = new Date('2026-11-25T17:59:00Z');
    const deps = store();

    const result = await getManagerDutyList(deps, beforeDhakaMidnight);

    expect(result.startsAt).toEqual(new Date('2026-11-24T18:00:00Z'));
  });

  it('rejects an invalid current date', async () => {
    await expect(getManagerDutyList(store(), new Date('invalid'))).rejects.toThrow(RangeError);
  });
});

describe('getMyDutyList', () => {
  it('returns the guard shifts in chronological order', async () => {
    const later = shift('2', '2026-11-27T08:00:00Z', '2026-11-27T12:00:00Z');
    const earlier = shift('1', '2026-11-26T00:00:00Z', '2026-11-26T04:00:00Z');

    const deps = store({
      listOverlappingForGuard: jest.fn(async () => [later, earlier]),
    });

    const result = await getMyDutyList(deps, 'guard-1', NOW);

    expect(deps.shifts.listOverlappingForGuard).toHaveBeenCalledWith(
      'guard-1',
      TODAY_START,
      WINDOW_END,
    );
    expect(result.shifts).toEqual([earlier, later]);
    expect(result.noShiftToday).toBe(false);
  });

  it('shows no shift today when the guard only has a shift tomorrow', async () => {
    const tomorrow = shift('1', '2026-11-26T18:00:00Z', '2026-11-26T22:00:00Z');
    const deps = store({
      listOverlappingForGuard: jest.fn(async () => [tomorrow]),
    });

    const result = await getMyDutyList(deps, 'guard-1', NOW);

    expect(result.noShiftToday).toBe(true);
    expect(result.shifts).toEqual([tomorrow]);
  });

  it('does not show no shift today for an overnight shift that started yesterday', async () => {
    const overnight = shift('1', '2026-11-25T17:00:00Z', '2026-11-26T02:00:00Z');
    const deps = store({
      listOverlappingForGuard: jest.fn(async () => [overnight]),
    });

    const result = await getMyDutyList(deps, 'guard-1', NOW);

    expect(result.noShiftToday).toBe(false);
  });

  it('shows no shift today when the only shift is removed', async () => {
    const removed = shift('1', '2026-11-25T18:00:00Z', '2026-11-26T18:00:00Z', 'Removed');
    const deps = store({
      listOverlappingForGuard: jest.fn(async () => [removed]),
    });

    const result = await getMyDutyList(deps, 'guard-1', NOW);

    expect(result.shifts).toEqual([]);
    expect(result.noShiftToday).toBe(true);
  });

  it('rejects a blank guard ID', async () => {
    await expect(getMyDutyList(store(), '  ', NOW)).rejects.toThrow('A guard ID is required.');
  });

  it('rejects an invalid current date', async () => {
    await expect(getMyDutyList(store(), 'guard-1', new Date('invalid'))).rejects.toThrow(
      RangeError,
    );
  });
});
