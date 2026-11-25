/**
 * Tests for overpayments (BM-04, BR-04): the list order, and marking one Refunded with its audit entry, including a
 * second refund and a missing overpayment.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { makeProfile } from './testFakes';
import {
  listOverpayments,
  OVERPAYMENT_ERRORS,
  refundOverpayment,
  type OverpaymentRow,
  type OverpaymentStore,
} from './overpaymentService';

const NOW = new Date('2026-11-26T09:00:00Z');
const MANAGER = makeProfile({ id: 'manager-1', role: 'manager' });

function row(overrides: Partial<OverpaymentRow> = {}): OverpaymentRow {
  return {
    id: 'op-1',
    status: 'Flagged',
    amountPoisha: 485000,
    flaggedAt: new Date('2026-11-20T10:00:00Z'),
    refundedAt: null,
    refundedByName: null,
    billingMonth: '2026-11-01',
    flatLabel: 'Block A, Flat 9A',
    gatewayTransactionId: 'SIM-1',
    ...overrides,
  };
}

function store(overrides: Partial<OverpaymentStore> = {}): OverpaymentStore {
  return {
    list: jest.fn(async () => []),
    findStatus: jest.fn(async () => 'Flagged' as const),
    markRefunded: jest.fn(async () => true),
    ...overrides,
  };
}

describe('listOverpayments', () => {
  it('puts Flagged first, oldest first, then Refunded, newest refund first (normal)', async () => {
    const rows = [
      row({ id: 'refunded-old', status: 'Refunded', refundedAt: new Date('2026-11-21T00:00:00Z') }),
      row({ id: 'flagged-new', flaggedAt: new Date('2026-11-25T00:00:00Z') }),
      row({ id: 'refunded-new', status: 'Refunded', refundedAt: new Date('2026-11-24T00:00:00Z') }),
      row({ id: 'flagged-old', flaggedAt: new Date('2026-11-19T00:00:00Z') }),
    ];
    const list = await listOverpayments(store({ list: jest.fn(async () => rows) }));
    expect(list.map((r) => r.id)).toEqual([
      'flagged-old',
      'flagged-new',
      'refunded-new',
      'refunded-old',
    ]);
  });

  it('is empty when there are none (boundary)', async () => {
    await expect(listOverpayments(store())).resolves.toEqual([]);
  });
});

describe('refundOverpayment', () => {
  it('marks a Flagged overpayment Refunded and logs who did it (normal)', async () => {
    const overpayments = store();
    const audit = jest.fn(async () => {});
    await refundOverpayment({ overpayments, audit }, 'op-1', MANAGER, NOW);

    expect(overpayments.markRefunded).toHaveBeenCalledWith('op-1', 'manager-1', NOW);
    expect(audit).toHaveBeenCalledWith({
      actorId: 'manager-1',
      action: 'overpayment.refunded',
      entityType: 'overpayments',
      entityId: 'op-1',
      oldValues: { status: 'Flagged' },
      newValues: { status: 'Refunded', refundedAt: NOW.toISOString() },
    });
  });

  it('refuses an overpayment that is already Refunded, since Refunded is final (409)', async () => {
    const overpayments = store({ findStatus: jest.fn(async () => 'Refunded' as const) });
    const audit = jest.fn(async () => {});
    const attempt = refundOverpayment({ overpayments, audit }, 'op-1', MANAGER, NOW);

    await expect(attempt).rejects.toMatchObject({
      code: 'CONFLICT',
      message: OVERPAYMENT_ERRORS.alreadyRefunded,
    });
    expect(overpayments.markRefunded).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses when someone else marked it in between (exception)', async () => {
    const overpayments = store({ markRefunded: jest.fn(async () => false) });
    const audit = jest.fn(async () => {});
    await expect(
      refundOverpayment({ overpayments, audit }, 'op-1', MANAGER, NOW),
    ).rejects.toBeInstanceOf(AppError);
    expect(audit).not.toHaveBeenCalled();
  });

  it('answers 404 for an overpayment that does not exist (invalid input)', async () => {
    const overpayments = store({ findStatus: jest.fn(async () => null) });
    await expect(
      refundOverpayment({ overpayments, audit: jest.fn() }, 'missing', MANAGER, NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: OVERPAYMENT_ERRORS.notFound });
  });
});
