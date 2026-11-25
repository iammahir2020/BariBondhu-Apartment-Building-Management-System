/**
 * Tests for what the committee member's home shows: the waiting expenses and the rates in order.
 *
 * @author Mahir Al Kamal
 */
import {
  orderRates,
  waitingForDecision,
  WAITING_SHOWN,
  type HomeExpense,
} from './committeeHomeView';

function expense(overrides: Partial<HomeExpense> = {}): HomeExpense {
  return {
    id: 'e-1',
    description: 'Water pump motor rewinding',
    category: 'repair',
    expenseDate: '2026-11-11',
    amountPoisha: 1850000,
    status: 'Waiting for approval',
    ...overrides,
  };
}

describe('waitingForDecision', () => {
  it('keeps only waiting expenses, oldest first (normal)', () => {
    const waiting = waitingForDecision([
      expense({ id: 'new', expenseDate: '2026-11-13' }),
      expense({ id: 'approved', status: 'Approved', expenseDate: '2026-11-01' }),
      expense({ id: 'old', expenseDate: '2026-11-11' }),
      expense({ id: 'rejected', status: 'Rejected' }),
    ]);
    expect(waiting.count).toBe(2);
    expect(waiting.shown.map((e) => e.id)).toEqual(['old', 'new']);
  });

  it(`shows at most ${WAITING_SHOWN} but counts them all (boundary)`, () => {
    const many = ['01', '02', '03', '04', '05'].map((day) =>
      expense({ id: day, expenseDate: `2026-11-${day}` }),
    );
    const waiting = waitingForDecision(many);
    expect(waiting.count).toBe(5);
    expect(waiting.shown.map((e) => e.id)).toEqual(['01', '02', '03']);
  });

  it('is empty when nothing waits (boundary)', () => {
    expect(waitingForDecision([])).toEqual({ count: 0, shown: [] });
  });
});

describe('orderRates', () => {
  it('orders the rates as the Rates page does (normal)', () => {
    const ordered = orderRates([
      { chargeType: 'water', amountPoisha: 50000, meetingDate: '2026-11-01' },
      { chargeType: 'service', amountPoisha: 380000, meetingDate: '2026-11-01' },
      { chargeType: 'generator', amountPoisha: 120000, meetingDate: '2026-11-01' },
    ]);
    expect(ordered.map((r) => r.chargeType)).toEqual(['service', 'generator', 'water']);
  });

  it('copes with a missing rate (boundary)', () => {
    expect(orderRates([])).toEqual([]);
  });
});
