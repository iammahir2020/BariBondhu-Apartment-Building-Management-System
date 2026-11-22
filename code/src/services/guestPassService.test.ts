/**
 * Tests for creating a guest pass (RES-03, BR-11): the guest count and visit window limits, a window that crosses
 * midnight or started already, the 6-digit code and its uniqueness among live passes, and who may create one. Case
 * IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { GuestPass, Profile } from '@/models';
import {
  PASS_ERRORS,
  createGuestPass,
  drawPassCode,
  type GuestPassDeps,
  type GuestPassStore,
  type NewPassInput,
} from '@/services/guestPassService';
import type { GuestPassTiming } from '@/services/guestPassStatus';
import { makeProfile, memoryAudit } from '@/services/testFakes';

/** Now: Monday 23 Nov 2026, 12:00 in Dhaka. */
const NOW = new Date('2026-11-23T12:00:00+06:00');

/** A Dhaka time on 23 Nov 2026 (or another day). */
function dhaka(time: string, day = 23): Date {
  return new Date(`2026-11-${day}T${time}:00+06:00`);
}

/** An in-memory pass store with the Rahman household's flat 1A. */
class MemoryPassStore implements GuestPassStore {
  readonly saved: GuestPass[] = [];
  readonly existing: (GuestPassTiming & { code: string })[] = [];
  flats = new Map([['occupancy-1A', 'flat-1A']]);

  async activeFlatOf(occupancyId: string): Promise<string | null> {
    return this.flats.get(occupancyId) ?? null;
  }

  async passesWithCode(code: string): Promise<GuestPassTiming[]> {
    return [...this.existing, ...this.saved].filter((p) => p.code === code);
  }

  async insert(pass: GuestPass): Promise<void> {
    this.saved.push(pass);
  }
}

const resident: Profile = makeProfile({
  id: 'resident-1A',
  role: 'resident',
  occupancyId: 'occupancy-1A',
});

/** A pass for 4 guests, today 18:00 to 22:00 (TC-R03-01). */
function input(overrides: Partial<NewPassInput> = {}): NewPassInput {
  return {
    guestName: 'Tanvir Ahmed',
    guestCount: 4,
    startsAt: dhaka('18:00'),
    endsAt: dhaka('22:00'),
    ...overrides,
  };
}

/** A random source that returns these numbers in turn. */
function numbers(...values: number[]): (max: number) => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

function setup(random = numbers(204816)): {
  deps: GuestPassDeps;
  passes: MemoryPassStore;
  entries: ReturnType<typeof memoryAudit>['entries'];
} {
  const passes = new MemoryPassStore();
  const { audit, entries } = memoryAudit();
  return { deps: { passes, audit, newId: () => 'pass-1', random }, passes, entries };
}

/** Runs a call and returns the AppError it throws, or fails the test. */
async function errorFrom(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

/** Expects a refusal with this message and no pass saved. */
async function expectRefused(
  overrides: Partial<NewPassInput>,
  message: string,
  status = 400,
): Promise<void> {
  const { deps, passes, entries } = setup();
  const error = await errorFrom(() => createGuestPass(deps, resident, input(overrides), NOW));
  expect(error).toMatchObject({ status, message });
  expect(passes.saved).toHaveLength(0);
  expect(entries).toHaveLength(0);
}

describe('createGuestPass: a normal pass', () => {
  it('saves a Scheduled pass for 4 guests with a 6-digit code (TC-R03-01)', async () => {
    const { deps, passes } = setup();
    const result = await createGuestPass(deps, resident, input(), NOW);

    expect(result.status).toBe('Scheduled');
    expect(result.pass).toEqual({
      id: 'pass-1',
      occupancyId: 'occupancy-1A',
      createdById: 'resident-1A',
      guestName: 'Tanvir Ahmed',
      guestCount: 4,
      startsAt: dhaka('18:00'),
      endsAt: dhaka('22:00'),
      code: '204816',
      guestsUsed: 0,
      cancelledAt: null,
      createdAt: NOW,
    });
    expect(passes.saved).toEqual([result.pass]);
  });

  it('writes an audit entry without the code (NFR-27)', async () => {
    const { deps, entries } = setup();
    await createGuestPass(deps, resident, input(), NOW);
    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'guest_pass.create',
        entityType: 'guest_passes',
        entityId: 'pass-1',
        oldValues: null,
        newValues: {
          guestCount: 4,
          startsAt: dhaka('18:00').toISOString(),
          endsAt: dhaka('22:00').toISOString(),
        },
      },
    ]);
  });

  it('trims the guest name', async () => {
    const { deps } = setup();
    const { pass } = await createGuestPass(deps, resident, input({ guestName: '  Nadia  ' }), NOW);
    expect(pass.guestName).toBe('Nadia');
  });

  it.each([1, 20])('saves a pass for %i guests (TC-R03-02)', async (guestCount) => {
    const { deps } = setup();
    await expect(
      createGuestPass(deps, resident, input({ guestCount }), NOW),
    ).resolves.toMatchObject({ pass: { guestCount } });
  });

  it('saves a window of exactly 24 hours (TC-R03-04)', async () => {
    const { deps } = setup();
    await expect(
      createGuestPass(
        deps,
        resident,
        input({ startsAt: dhaka('18:00'), endsAt: dhaka('18:00', 24) }),
        NOW,
      ),
    ).resolves.toMatchObject({ status: 'Scheduled' });
  });

  it('saves a pass that crosses midnight, 22:00 to 02:00 (TC-R03-08)', async () => {
    const { deps } = setup();
    const { pass } = await createGuestPass(
      deps,
      resident,
      input({ startsAt: dhaka('22:00'), endsAt: dhaka('02:00', 24) }),
      NOW,
    );
    expect(pass.endsAt).toEqual(dhaka('02:00', 24));
  });

  it('saves a pass that has already started and is Active at once (Decision 4)', async () => {
    const { deps } = setup();
    await expect(
      createGuestPass(
        deps,
        resident,
        input({ startsAt: dhaka('11:00'), endsAt: dhaka('15:00') }),
        NOW,
      ),
    ).resolves.toMatchObject({ status: 'Active' });
  });
});

describe('createGuestPass: guest name and count', () => {
  it.each(['', '   '])('refuses an empty guest name %j (TC-R03-09)', async (guestName) => {
    await expectRefused({ guestName }, "Enter the guest's name");
  });

  it.each([0, 21, -1, 2.5, Number.NaN])(
    'refuses %p guests with "Enter 1 to 20 guests" (TC-R03-03)',
    async (guestCount) => {
      await expectRefused({ guestCount }, 'Enter 1 to 20 guests');
    },
  );
});

describe('createGuestPass: the visit times', () => {
  it('refuses 24 hours and 1 minute (TC-R03-05)', async () => {
    await expectRefused(
      { startsAt: dhaka('18:00'), endsAt: dhaka('18:01', 24) },
      'Check the visit times',
    );
  });

  it.each([
    ['before', dhaka('17:00')],
    ['equal to', dhaka('18:00')],
  ])('refuses an end time %s the start time (TC-R03-06)', async (_, endsAt) => {
    await expectRefused({ startsAt: dhaka('18:00'), endsAt }, 'Check the visit times');
  });

  it.each([
    ['already past', dhaka('11:00')],
    ['exactly now', NOW],
  ])('refuses an end time that is %s (TC-R03-07)', async (_, endsAt) => {
    await expectRefused({ startsAt: dhaka('09:00'), endsAt }, 'Check the visit times');
  });

  it.each([
    ['no start', { startsAt: null }],
    ['no end', { endsAt: null }],
    ['an invalid date', { startsAt: new Date('not a date') }],
  ])('refuses %s (TC-R03-09)', async (_, overrides: Partial<NewPassInput>) => {
    await expectRefused(overrides, 'Check the visit times');
  });

  it('checks the name before the count, and the count before the times', async () => {
    const { deps } = setup();
    const all = input({ guestName: '', guestCount: 0, endsAt: null });
    expect((await errorFrom(() => createGuestPass(deps, resident, all, NOW))).message).toBe(
      PASS_ERRORS.guestName,
    );
    const two = input({ guestCount: 0, endsAt: null });
    expect((await errorFrom(() => createGuestPass(deps, resident, two, NOW))).message).toBe(
      PASS_ERRORS.guestCount,
    );
  });
});

describe('createGuestPass: the code', () => {
  it('keeps leading zeros: 4271 becomes "004271" (TC-R03-10)', async () => {
    const { deps } = setup(numbers(4271));
    const { pass } = await createGuestPass(deps, resident, input(), NOW);
    expect(pass.code).toBe('004271');
  });

  it.each([
    ['Scheduled', { startsAt: dhaka('20:00'), endsAt: dhaka('23:00') }],
    ['Active', { startsAt: dhaka('11:00'), endsAt: dhaka('14:00') }],
    ['Partly used', { startsAt: dhaka('11:00'), endsAt: dhaka('14:00'), guestsUsed: 1 }],
  ])(
    'draws a new code when the first matches a %s pass (TC-R03-11)',
    async (_, timing: Partial<GuestPassTiming>) => {
      const { deps, passes } = setup(numbers(111111, 222222));
      passes.existing.push({
        code: '111111',
        startsAt: dhaka('11:00'),
        endsAt: dhaka('14:00'),
        guestCount: 2,
        guestsUsed: 0,
        cancelledAt: null,
        ...timing,
      });
      const { pass } = await createGuestPass(deps, resident, input(), NOW);
      expect(pass.code).toBe('222222');
    },
  );

  it.each([
    ['Expired', { endsAt: dhaka('11:00') }],
    ['Cancelled', { cancelledAt: dhaka('10:30') }],
    ['Fully used', { guestsUsed: 2 }],
  ])(
    'allows the code of a pass that is %s (TC-R03-12)',
    async (_, timing: Partial<GuestPassTiming>) => {
      const { deps, passes } = setup(numbers(111111, 222222));
      passes.existing.push({
        code: '111111',
        startsAt: dhaka('09:00'),
        endsAt: dhaka('14:00'),
        guestCount: 2,
        guestsUsed: 0,
        cancelledAt: null,
        ...timing,
      });
      const { pass } = await createGuestPass(deps, resident, input(), NOW);
      expect(pass.code).toBe('111111');
    },
  );

  it('gives up with a 500 after 10 draws that are all taken', async () => {
    const { deps, passes } = setup(numbers(111111));
    passes.existing.push({
      code: '111111',
      startsAt: dhaka('11:00'),
      endsAt: dhaka('14:00'),
      guestCount: 2,
      guestsUsed: 0,
      cancelledAt: null,
    });
    const error = await errorFrom(() => createGuestPass(deps, resident, input(), NOW));
    expect(error).toMatchObject({ status: 500, message: PASS_ERRORS.noCode });
    expect(passes.saved).toHaveLength(0);
  });

  it('draws from a secure random source by default, not Math.random (TC-R03-13)', async () => {
    const mathRandom = jest.spyOn(Math, 'random');
    const passes = new MemoryPassStore();
    const { audit } = memoryAudit();
    const { pass } = await createGuestPass({ passes, audit }, resident, input(), NOW);

    expect(pass.code).toMatch(/^\d{6}$/);
    expect(pass.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });

  it('asks the random source for a number below 1,000,000', () => {
    const asked: number[] = [];
    drawPassCode((max) => {
      asked.push(max);
      return 999999;
    });
    expect(asked).toEqual([1_000_000]);
    expect(drawPassCode(() => 0)).toBe('000000');
  });
});

describe('createGuestPass: who can create one', () => {
  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { deps, passes } = setup();
      const error = await errorFrom(() =>
        createGuestPass(deps, makeProfile({ role, occupancyId: null }), input(), NOW),
      );
      expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
      expect(passes.saved).toHaveLength(0);
    },
  );

  it('refuses a household that has moved out (403)', async () => {
    const { deps, passes } = setup();
    passes.flats.clear();
    const error = await errorFrom(() => createGuestPass(deps, resident, input(), NOW));
    expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
  });
});
