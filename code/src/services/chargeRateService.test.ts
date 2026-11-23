/**
 * Tests for charge rates: a new rate replaces the current one, bad input is refused with the SRS message, every
 * change is audited, and current rates and rate history read back correctly (CM-01, R-12, NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import type { ChargeRate, NewChargeRate } from '@/models';
import {
  INVALID_RATE_MESSAGE,
  getCurrentRates,
  getRateHistory,
  setRate,
  type ChargeRateDeps,
  type ChargeRateStore,
  type ChargeType,
  type SetRateInput,
} from '@/services/chargeRateService';
import { memoryAudit } from '@/services/testFakes';

const COMMITTEE_ID = 'committee-1';

/** An in-memory rate store. Each saved row gets the next second as its createdAt, so ordering is predictable. */
class MemoryRateStore implements ChargeRateStore {
  readonly rows: ChargeRate[] = [];

  async listCurrent(): Promise<ChargeRate[]> {
    return this.rows.filter((row) => row.status === 'Current');
  }

  async listAll(): Promise<ChargeRate[]> {
    return [...this.rows];
  }

  async replaceCurrent(
    rate: NewChargeRate,
  ): Promise<{ previous: ChargeRate | null; created: ChargeRate }> {
    const current = this.rows.find(
      (row) => row.chargeType === rate.chargeType && row.status === 'Current',
    );
    const previous = current ? { ...current } : null;
    if (current) current.status = 'Replaced';

    const created: ChargeRate = {
      id: `rate-${this.rows.length + 1}`,
      chargeType: rate.chargeType,
      amountPoisha: rate.amountPoisha,
      meetingDate: rate.meetingDate,
      setBy: rate.setBy,
      status: 'Current',
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, this.rows.length + 1)),
    };
    this.rows.push(created);
    return { previous, created };
  }
}

function setUp() {
  const store = new MemoryRateStore();
  const { audit, entries } = memoryAudit();
  const deps: ChargeRateDeps = { rates: store, audit };
  return { deps, store, entries };
}

/** A valid input, with fields to change. */
function input(overrides: Partial<SetRateInput> = {}): SetRateInput {
  return {
    chargeType: 'service',
    amountPoisha: 500000,
    meetingDate: '2026-11-15',
    ...overrides,
  };
}

describe('setRate', () => {
  it('saves the first rate as Current and logs it with no old values (normal, CM-01)', async () => {
    const { deps, store, entries } = setUp();
    const created = await setRate(deps, input(), COMMITTEE_ID);

    expect(created).toMatchObject({
      chargeType: 'service',
      amountPoisha: 500000,
      meetingDate: '2026-11-15',
      setBy: COMMITTEE_ID,
      status: 'Current',
    });
    expect(store.rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: COMMITTEE_ID,
      action: 'chargeRate.set',
      entityType: 'charge_rates',
      entityId: created.id,
      oldValues: null,
      newValues: { chargeType: 'service', amountPoisha: 500000, meetingDate: '2026-11-15' },
    });
  });

  it('replaces the current rate: the old one becomes Replaced and is logged as old values', async () => {
    const { deps, store, entries } = setUp();
    await setRate(deps, input({ amountPoisha: 500000, meetingDate: '2026-10-01' }), COMMITTEE_ID);
    await setRate(deps, input({ amountPoisha: 600000, meetingDate: '2026-11-15' }), COMMITTEE_ID);

    expect(store.rows.map((row) => row.status)).toEqual(['Replaced', 'Current']);
    expect(entries[1]).toMatchObject({
      oldValues: { chargeType: 'service', amountPoisha: 500000, meetingDate: '2026-10-01' },
      newValues: { chargeType: 'service', amountPoisha: 600000, meetingDate: '2026-11-15' },
    });
  });

  it('keeps one Current rate per charge type (normal)', async () => {
    const { deps, store } = setUp();
    await setRate(deps, input({ chargeType: 'service' }), COMMITTEE_ID);
    await setRate(deps, input({ chargeType: 'water' }), COMMITTEE_ID);
    await setRate(deps, input({ chargeType: 'service', amountPoisha: 700000 }), COMMITTEE_ID);

    const current = store.rows.filter((row) => row.status === 'Current');
    expect(current.map((row) => row.chargeType).sort()).toEqual(['service', 'water']);
  });

  it('accepts a rate of 0 (boundary)', async () => {
    const { deps } = setUp();
    const created = await setRate(deps, input({ amountPoisha: 0 }), COMMITTEE_ID);
    expect(created.amountPoisha).toBe(0);
  });

  const unknownType = 'gas' as ChargeType;

  it.each<[string, SetRateInput]>([
    ['a blank rate', input({ amountPoisha: null })],
    ['a negative rate', input({ amountPoisha: -1 })],
    ['a rate that is not whole poisha', input({ amountPoisha: 1.5 })],
    ['no meeting date', input({ meetingDate: null })],
    ['a meeting date that is not a date', input({ meetingDate: 'last Friday' })],
    ['a date that does not exist', input({ meetingDate: '2026-02-30' })],
    ['an unknown charge type', input({ chargeType: unknownType })],
  ])('refuses %s with the SRS message and changes nothing (invalid input)', async (_name, bad) => {
    const { deps, store, entries } = setUp();
    await expect(setRate(deps, bad, COMMITTEE_ID)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: INVALID_RATE_MESSAGE,
    });
    expect(store.rows).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('uses the exact SRS wording (CM-01)', () => {
    expect(INVALID_RATE_MESSAGE).toBe('Enter a valid rate and meeting date');
  });

  it('writes no audit entry if saving the rate fails (exception)', async () => {
    const { deps, entries } = setUp();
    deps.rates.replaceCurrent = async () => Promise.reject(new Error('save failed'));
    await expect(setRate(deps, input(), COMMITTEE_ID)).rejects.toThrow('save failed');
    expect(entries).toHaveLength(0);
  });
});

describe('getCurrentRates', () => {
  it('is empty when no rate has been set yet (boundary)', async () => {
    const { deps } = setUp();
    expect(await getCurrentRates(deps)).toEqual([]);
  });

  it('returns only Current rates, in screen order: service, generator, water', async () => {
    const { deps } = setUp();
    await setRate(deps, input({ chargeType: 'water', amountPoisha: 100000 }), COMMITTEE_ID);
    await setRate(deps, input({ chargeType: 'service', amountPoisha: 500000 }), COMMITTEE_ID);
    await setRate(deps, input({ chargeType: 'generator', amountPoisha: 200000 }), COMMITTEE_ID);
    await setRate(deps, input({ chargeType: 'service', amountPoisha: 600000 }), COMMITTEE_ID);

    const current = await getCurrentRates(deps);
    expect(current.map((rate) => [rate.chargeType, rate.amountPoisha])).toEqual([
      ['service', 600000],
      ['generator', 200000],
      ['water', 100000],
    ]);
  });
});

describe('getRateHistory', () => {
  it('is empty when no rate has been set yet (boundary)', async () => {
    const { deps } = setUp();
    expect(await getRateHistory(deps)).toEqual([]);
  });

  it('shows who, when, meeting date, and old and new value, newest first (CM-01)', async () => {
    const { deps } = setUp();
    await setRate(deps, input({ amountPoisha: 500000, meetingDate: '2026-10-01' }), 'member-1');
    await setRate(deps, input({ amountPoisha: 600000, meetingDate: '2026-11-15' }), 'member-2');
    await setRate(deps, input({ chargeType: 'water', amountPoisha: 100000 }), 'member-1');

    const history = await getRateHistory(deps);
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.newAmountPoisha)).toEqual([100000, 600000, 500000]);

    expect(history[1]).toMatchObject({
      chargeType: 'service',
      oldAmountPoisha: 500000,
      newAmountPoisha: 600000,
      meetingDate: '2026-11-15',
      setBy: 'member-2',
    });
    expect(history[1]?.changedAt).toBeInstanceOf(Date);
  });

  it('shows the first rate ever set with no old value (boundary)', async () => {
    const { deps } = setUp();
    await setRate(deps, input({ chargeType: 'water' }), COMMITTEE_ID);
    const history = await getRateHistory(deps);
    expect(history[0]).toMatchObject({ chargeType: 'water', oldAmountPoisha: null });
  });
});
