/**
 * Tests for a resident's guest passes (RES-03, BR-11). Creating: the guest count and visit window limits, a window
 * that crosses midnight or started already, the 6-digit code and its uniqueness among live passes, and who may
 * create one. Cancelling: only a live pass, only my household's. Listing: only my household's, with the status now.
 * Case IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { GuestPass, Profile } from '@/models';
import {
  CANCEL_PASS_ERRORS,
  PASS_ERRORS,
  cancelGuestPass,
  createGuestPass,
  drawPassCode,
  listMyGuestPasses,
  type GuestPassDeps,
  type GuestPassStore,
  type NewPassInput,
} from '@/services/guestPassService';
import {
  guestPassStatusAt,
  isLiveGuestPassStatus,
  type GuestPassTiming,
} from '@/services/guestPassStatus';
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

  async findById(id: string): Promise<GuestPass | null> {
    return this.saved.find((p) => p.id === id) ?? null;
  }

  async listForOccupancy(occupancyId: string): Promise<GuestPass[]> {
    return this.saved.filter((p) => p.occupancyId === occupancyId);
  }

  /**
   * Makes `cancelIfLive` lose a race: 'lastGuest' as if a guard checked the last guest in first, 'unknown' as if the
   * save failed while the pass still reads as live.
   */
  raceLost: 'lastGuest' | 'unknown' | null = null;

  async cancelIfLive(id: string, at: Date): Promise<boolean> {
    const pass = this.saved.find((p) => p.id === id);
    if (!pass) return false;
    if (this.raceLost === 'lastGuest') pass.guestsUsed = pass.guestCount;
    if (this.raceLost !== null) return false;
    if (!isLiveGuestPassStatus(guestPassStatusAt(pass, at))) return false;
    pass.cancelledAt = at;
    return true;
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

/** A saved pass of the Rahman household: 4 guests, today 18:00 to 22:00, nobody in yet. */
function makePass(overrides: Partial<GuestPass> = {}): GuestPass {
  return {
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
    createdAt: dhaka('09:00'),
    ...overrides,
  };
}

/** A store holding these passes, with its audit entries. */
function setupWith(...saved: GuestPass[]): ReturnType<typeof setup> {
  const result = setup();
  result.passes.saved.push(...saved);
  return result;
}

describe('cancelGuestPass: a live pass (TC-R03-19)', () => {
  it.each([
    ['Scheduled', {}],
    ['Active', { startsAt: dhaka('10:00'), endsAt: dhaka('14:00') }],
    ['Partly used', { startsAt: dhaka('10:00'), endsAt: dhaka('14:00'), guestsUsed: 2 }],
  ] as const)('cancels a %s pass at once', async (status, overrides) => {
    const { deps, passes } = setupWith(makePass(overrides));
    expect(guestPassStatusAt(makePass(overrides), NOW)).toBe(status);

    const result = await cancelGuestPass(deps, resident, 'pass-1', NOW);

    expect(result.status).toBe('Cancelled');
    expect(result.pass.cancelledAt).toEqual(NOW);
    expect(passes.saved[0]?.cancelledAt).toEqual(NOW);
  });

  it('leaves the guests already inside alone, so they can still be checked out (BR-11)', async () => {
    const live = { startsAt: dhaka('10:00'), endsAt: dhaka('14:00'), guestsUsed: 2 };
    const { deps, passes } = setupWith(makePass(live));
    await cancelGuestPass(deps, resident, 'pass-1', NOW);
    expect(passes.saved[0]?.guestsUsed).toBe(2);
  });

  it('writes an audit entry with the status before and after (NFR-27)', async () => {
    const { deps, entries } = setupWith(makePass());
    await cancelGuestPass(deps, resident, 'pass-1', NOW);
    expect(entries).toEqual([
      {
        actorId: 'resident-1A',
        action: 'guest_pass.cancel',
        entityType: 'guest_passes',
        entityId: 'pass-1',
        oldValues: { status: 'Scheduled' },
        newValues: { status: 'Cancelled' },
      },
    ]);
  });

  it('cancels one millisecond before the end time', async () => {
    const { deps } = setupWith(makePass({ startsAt: dhaka('10:00'), endsAt: dhaka('12:00') }));
    const result = await cancelGuestPass(deps, resident, 'pass-1', new Date(NOW.getTime() - 1));
    expect(result.status).toBe('Cancelled');
  });
});

describe('cancelGuestPass: a pass that is no longer live (TC-R03-20)', () => {
  it.each([
    ['Cancelled', { cancelledAt: dhaka('11:00') }],
    ['Expired', { startsAt: dhaka('08:00'), endsAt: dhaka('11:00') }],
    ['Fully used', { startsAt: dhaka('10:00'), endsAt: dhaka('14:00'), guestsUsed: 4 }],
  ] as const)('refuses a %s pass (409) and changes nothing', async (status, overrides) => {
    const { deps, passes, entries } = setupWith(makePass(overrides));
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));

    expect(error).toMatchObject({
      status: 409,
      message: CANCEL_PASS_ERRORS[status],
      details: { status },
    });
    expect(passes.saved[0]).toEqual(makePass(overrides));
    expect(entries).toHaveLength(0);
  });

  it('refuses exactly at the end time, when the pass is Expired', async () => {
    const { deps } = setupWith(makePass({ startsAt: dhaka('10:00'), endsAt: dhaka('12:00') }));
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));
    expect(error).toMatchObject({ status: 409, message: CANCEL_PASS_ERRORS.Expired });
  });

  it('refuses if the last guest comes in between the check and the save (409)', async () => {
    const live = { startsAt: dhaka('10:00'), endsAt: dhaka('14:00'), guestsUsed: 3 };
    const { deps, passes, entries } = setupWith(makePass(live));
    passes.raceLost = 'lastGuest';

    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));

    expect(error).toMatchObject({
      status: 409,
      message: CANCEL_PASS_ERRORS['Fully used'],
      details: { status: 'Fully used' },
    });
    expect(passes.saved[0]?.cancelledAt).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it('asks to try again if the save fails while the pass still reads as live (409)', async () => {
    const { deps, passes, entries } = setupWith(makePass());
    passes.raceLost = 'unknown';
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));
    expect(error).toMatchObject({ status: 409, message: CANCEL_PASS_ERRORS.changed });
    expect(entries).toHaveLength(0);
  });
});

describe('cancelGuestPass: whose pass it is', () => {
  it("refuses another household's pass (403) and changes nothing (TC-R03-23)", async () => {
    const theirs = makePass({ occupancyId: 'occupancy-2B', createdById: 'resident-2B' });
    const { deps, passes, entries } = setupWith(theirs);
    passes.flats.set('occupancy-2B', 'flat-2B');

    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));

    expect(error).toMatchObject({ status: 403, message: CANCEL_PASS_ERRORS.notYours });
    expect(passes.saved[0]?.cancelledAt).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("refuses the earlier household's pass in the same flat (403, BR-09)", async () => {
    const { deps, passes } = setupWith(makePass({ occupancyId: 'occupancy-1A-old' }));
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));
    expect(error).toMatchObject({ status: 403, message: CANCEL_PASS_ERRORS.notYours });
    expect(passes.saved[0]?.cancelledAt).toBeNull();
  });

  it('says so when there is no such pass (404)', async () => {
    const { deps } = setupWith(makePass());
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-404', NOW));
    expect(error).toMatchObject({ status: 404, message: CANCEL_PASS_ERRORS.notFound });
  });

  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { deps, passes } = setupWith(makePass());
      const error = await errorFrom(() =>
        cancelGuestPass(deps, makeProfile({ role, occupancyId: null }), 'pass-1', NOW),
      );
      expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
      expect(passes.saved[0]?.cancelledAt).toBeNull();
    },
  );

  it('refuses a household that has moved out (403)', async () => {
    const { deps, passes } = setupWith(makePass());
    passes.flats.clear();
    const error = await errorFrom(() => cancelGuestPass(deps, resident, 'pass-1', NOW));
    expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
    expect(passes.saved[0]?.cancelledAt).toBeNull();
  });
});

describe('listMyGuestPasses', () => {
  it("lists only my household's passes, latest start first, each with its status now (TC-R03-21)", async () => {
    const scheduled = makePass({ id: 'tonight' });
    const partly = makePass({
      id: 'lunch',
      startsAt: dhaka('11:00'),
      endsAt: dhaka('15:00'),
      guestsUsed: 1,
    });
    const expired = makePass({
      id: 'yesterday',
      startsAt: dhaka('18:00', 22),
      endsAt: dhaka('22:00', 22),
    });
    const cancelled = makePass({
      id: 'tomorrow',
      startsAt: dhaka('10:00', 24),
      endsAt: dhaka('12:00', 24),
      cancelledAt: dhaka('08:00'),
    });
    const theirs = makePass({ id: 'theirs', occupancyId: 'occupancy-2B' });
    const { passes } = setupWith(scheduled, partly, expired, theirs, cancelled);

    const list = await listMyGuestPasses(passes, resident, NOW);

    expect(list.map(({ pass, status }) => [pass.id, status])).toEqual([
      ['tomorrow', 'Cancelled'],
      ['tonight', 'Scheduled'],
      ['lunch', 'Partly used'],
      ['yesterday', 'Expired'],
    ]);
  });

  it("doesn't show an earlier household's passes to the new household in the same flat (TC-R03-22)", async () => {
    const { passes } = setupWith(makePass({ id: 'old', occupancyId: 'occupancy-1A-old' }));
    expect(await listMyGuestPasses(passes, resident, NOW)).toEqual([]);
  });

  it('shows the status at the time asked, so a pass turns Expired at its end time', async () => {
    const { passes } = setupWith(makePass());
    const [atEnd] = await listMyGuestPasses(passes, resident, dhaka('22:00'));
    expect(atEnd?.status).toBe('Expired');
  });

  it.each(['guard', 'manager', 'committee', 'maintenance', 'admin'] as const)(
    'refuses a %s account (403)',
    async (role) => {
      const { passes } = setupWith(makePass());
      const error = await errorFrom(() =>
        listMyGuestPasses(passes, makeProfile({ role, occupancyId: null }), NOW),
      );
      expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
    },
  );

  it('refuses a household that has moved out (403)', async () => {
    const { passes } = setupWith(makePass());
    passes.flats.clear();
    const error = await errorFrom(() => listMyGuestPasses(passes, resident, NOW));
    expect(error).toMatchObject({ status: 403, message: PASS_ERRORS.household });
  });
});
