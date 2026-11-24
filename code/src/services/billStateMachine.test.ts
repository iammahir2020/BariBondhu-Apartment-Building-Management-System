/**
 * Tests for the bill state machine (BM-03, BM-04, BR-02 to BR-07).
 *
 * @author Jannatul Ferdus Nishi
 */

import {
  BILL_TRANSITIONS,
  allowedBillTransitions,
  checkBillTransition,
  isFinalBillStatus,
} from './billStateMachine';

describe('Bill state machine', () => {
  it.each(BILL_TRANSITIONS)('allows $from -> $to using $action by $actor', (transition) => {
    expect(
      checkBillTransition(
        transition.from,
        transition.to,
        transition.actor,
        transition.action,
        transition.needsReason ? 'Valid explanation' : undefined,
      ),
    ).toEqual(transition);
  });

  it('rejects transitions not defined in the state machine', () => {
    expect(() =>
      checkBillTransition('Unpaid', 'Carried forward', 'resident', 'carry_forward'),
    ).toThrow();

    expect(() =>
      checkBillTransition('Paid', 'Unpaid', 'manager', 'reject_payment_claim'),
    ).toThrow();

    expect(() =>
      checkBillTransition('Carried forward', 'Paid', 'gateway', 'confirm_online_payment'),
    ).toThrow();
  });

  it('rejects changes made by an unauthorized actor', () => {
    expect(() =>
      checkBillTransition('Awaiting verification', 'Paid', 'resident', 'accept_payment_claim'),
    ).toThrow('Only the building manager');

    expect(() =>
      checkBillTransition('Payment pending', 'Paid', 'resident', 'confirm_online_payment'),
    ).toThrow('Only the gateway');
  });

  it('requires a reason to reject a payment claim', () => {
    expect(() =>
      checkBillTransition('Awaiting verification', 'Unpaid', 'manager', 'reject_payment_claim'),
    ).toThrow('Give a reason.');

    expect(() =>
      checkBillTransition(
        'Awaiting verification',
        'Unpaid',
        'manager',
        'reject_payment_claim',
        '   ',
      ),
    ).toThrow('Give a reason.');

    expect(() =>
      checkBillTransition(
        'Awaiting verification',
        'Unpaid',
        'manager',
        'reject_payment_claim',
        'Payment proof could not be verified',
      ),
    ).not.toThrow();
  });

  it('identifies Paid and Carried forward as final statuses', () => {
    expect(isFinalBillStatus('Paid')).toBe(true);
    expect(isFinalBillStatus('Carried forward')).toBe(true);
    expect(isFinalBillStatus('Unpaid')).toBe(false);
    expect(isFinalBillStatus('Payment pending')).toBe(false);
    expect(isFinalBillStatus('Awaiting verification')).toBe(false);
  });

  it('returns only transitions available to the specified actor', () => {
    const residentTransitions = allowedBillTransitions('Unpaid', 'resident');

    expect(residentTransitions.map((transition) => transition.action)).toEqual([
      'start_online_payment',
      'submit_payment_claim',
    ]);

    expect(allowedBillTransitions('Paid', 'manager')).toEqual([]);
    expect(allowedBillTransitions('Carried forward', 'system')).toEqual([]);
  });

  it('blocks conflicting payment flows', () => {
    expect(() =>
      checkBillTransition(
        'Payment pending',
        'Awaiting verification',
        'resident',
        'submit_payment_claim',
      ),
    ).toThrow();

    expect(() =>
      checkBillTransition(
        'Awaiting verification',
        'Payment pending',
        'resident',
        'start_online_payment',
      ),
    ).toThrow();

    expect(() =>
      checkBillTransition('Payment pending', 'Paid', 'manager', 'record_direct_payment'),
    ).toThrow();
  });
});
