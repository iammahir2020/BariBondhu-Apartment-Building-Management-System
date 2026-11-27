/**
 * Tests for the shift planning service using an in-memory fake store.
 *
 * @author Tawhid Bin Moslim Tawhid
 */
import type { NewShift, Shift } from '@/models';
import { planShift, type ExistingShift, type ShiftGuard, type ShiftStore } from './shiftService';

const guard: ShiftGuard = {
  id: 'guard-1',
  role: 'guard',
  active: true,
};

const start = new Date('2026-11-27T08:00:00.000Z');
const end = new Date('2026-11-27T16:00:00.000Z');

/** Creates an existing shift for overlap tests. */
function makeExistingShift(
  startsAt: Date,
  endsAt: Date,
  status: ExistingShift['status'] = 'Planned',
): ExistingShift {
  return { startsAt, endsAt, status };
}

/** Creates a fake store with configurable guard and shift data. */
function makeStore(
  options: {
    foundGuard?: ShiftGuard | null;
    existingShifts?: ExistingShift[];
  } = {},
) {
  const saved: NewShift[] = [];

  const store: ShiftStore = {
    async findGuard() {
      return options.foundGuard === undefined ? guard : options.foundGuard;
    },

    async listForGuard() {
      return options.existingShifts ?? [];
    },

    async create(input) {
      saved.push(input);

      return {
        id: 'shift-1',
        ...input,
        status: 'Planned',
      } as Shift;
    },
  };

  return { store, saved };
}

describe('planShift', () => {
  it('creates a shift for an active guard', async () => {
    const { store, saved } = makeStore();

    const result = await planShift(
      { shifts: store },
      {
        guardId: 'guard-1',
        startsAt: start,
        endsAt: end,
      },
    );

    expect(result.status).toBe('Planned');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({
      guardId: 'guard-1',
      startsAt: start,
      endsAt: end,
    });
  });

  it('allows a shift that crosses midnight', async () => {
    const { store, saved } = makeStore();

    await planShift(
      { shifts: store },
      {
        guardId: 'guard-1',
        startsAt: new Date('2026-11-27T20:00:00.000Z'),
        endsAt: new Date('2026-11-28T04:00:00.000Z'),
      },
    );

    expect(saved).toHaveLength(1);
  });

  it('allows a shift lasting exactly 24 hours', async () => {
    const { store, saved } = makeStore();

    await planShift(
      { shifts: store },
      {
        guardId: 'guard-1',
        startsAt: start,
        endsAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      },
    );

    expect(saved).toHaveLength(1);
  });

  it('rejects a shift lasting more than 24 hours', async () => {
    const { store, saved } = makeStore();

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: new Date(start.getTime() + 24 * 60 * 60 * 1000 + 1),
        },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Check the shift times',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects an end time equal to the start time', async () => {
    const { store, saved } = makeStore();

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: start,
        },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Check the shift times',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects an end time before the start time', async () => {
    const { store, saved } = makeStore();

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: end,
          endsAt: start,
        },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Check the shift times',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects invalid date values', async () => {
    const { store, saved } = makeStore();

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: new Date(Number.NaN),
          endsAt: end,
        },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Check the shift times',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects a guard that does not exist', async () => {
    const { store, saved } = makeStore({ foundGuard: null });

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: end,
        },
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects an inactive guard', async () => {
    const { store, saved } = makeStore({
      foundGuard: { ...guard, active: false },
    });

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: end,
        },
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects a profile that is not a guard', async () => {
    const { store, saved } = makeStore({
      foundGuard: { ...guard, role: 'manager' },
    });

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: end,
        },
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(saved).toHaveLength(0);
  });

  it('rejects an overlapping shift for the same guard', async () => {
    const { store, saved } = makeStore({
      existingShifts: [
        makeExistingShift(
          new Date('2026-11-27T12:00:00.000Z'),
          new Date('2026-11-27T18:00:00.000Z'),
        ),
      ],
    });

    await expect(
      planShift(
        { shifts: store },
        {
          guardId: 'guard-1',
          startsAt: start,
          endsAt: end,
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This guard already has a shift then',
    });

    expect(saved).toHaveLength(0);
  });

  it('allows shifts that meet exactly at the boundary', async () => {
    const { store, saved } = makeStore({
      existingShifts: [makeExistingShift(new Date('2026-11-27T00:00:00.000Z'), start)],
    });

    await planShift(
      { shifts: store },
      {
        guardId: 'guard-1',
        startsAt: start,
        endsAt: end,
      },
    );

    expect(saved).toHaveLength(1);
  });

  it('ignores removed shifts when checking for overlap', async () => {
    const { store, saved } = makeStore({
      existingShifts: [
        makeExistingShift(
          new Date('2026-11-27T12:00:00.000Z'),
          new Date('2026-11-27T18:00:00.000Z'),
          'Removed',
        ),
      ],
    });

    await planShift(
      { shifts: store },
      {
        guardId: 'guard-1',
        startsAt: start,
        endsAt: end,
      },
    );

    expect(saved).toHaveLength(1);
  });
});
