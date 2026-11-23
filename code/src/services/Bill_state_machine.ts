/**
 * Bill state machine for payment, verification and carried-forward flows.
 * Follows BM-03, BM-04 and BR-02 through BR-07.
 *
 * This module validates transitions only. Payment confirmation,
 * amount checks and database updates belong to the calling services.
 *
 * @author Jannatul Ferdus Nishi
 */
import { AppError } from '@/lib/errors';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { billStatusEnum } from '@/models/Bill';

/** Bill statuses defined by the database model. */
export type BillStatus = (typeof billStatusEnum.enumValues)[number];

/** Allowed actions that can change a bill's status. */
export type BillAction =
  | 'start_online_payment'
  | 'confirm_online_payment'
  | 'fail_online_payment'
  | 'submit_payment_claim'
  | 'accept_payment_claim'
  | 'reject_payment_claim'
  | 'record_direct_payment'
  | 'carry_forward'
  | 'settle_zero_balance';

/** Who initiates a transition. */
export type BillActor = Role | 'system' | 'gateway';

/** One permitted bill status transition. */
export interface BillTransition {
  readonly from: BillStatus;
  readonly to: BillStatus;
  readonly action: BillAction;
  readonly actor: BillActor;
  readonly needsReason: boolean;
}

/** Allowed transitions; anything not listed is rejected. */
export const BILL_TRANSITIONS: readonly BillTransition[] = [
  {
    from: 'Unpaid',
    to: 'Payment pending',
    action: 'start_online_payment',
    actor: 'resident',
    needsReason: false,
  },
  {
    from: 'Payment pending',
    to: 'Paid',
    action: 'confirm_online_payment',
    actor: 'gateway',
    needsReason: false,
  },
  {
    from: 'Unpaid',
    to: 'Paid',
    action: 'confirm_online_payment',
    actor: 'gateway',
    needsReason: false,
  },
  {
    from: 'Payment pending',
    to: 'Unpaid',
    action: 'fail_online_payment',
    actor: 'system',
    needsReason: false,
  },
  {
    from: 'Unpaid',
    to: 'Awaiting verification',
    action: 'submit_payment_claim',
    actor: 'resident',
    needsReason: false,
  },
  {
    from: 'Awaiting verification',
    to: 'Paid',
    action: 'accept_payment_claim',
    actor: 'manager',
    needsReason: false,
  },
  {
    from: 'Awaiting verification',
    to: 'Unpaid',
    action: 'reject_payment_claim',
    actor: 'manager',
    needsReason: true,
  },
  {
    from: 'Unpaid',
    to: 'Paid',
    action: 'record_direct_payment',
    actor: 'manager',
    needsReason: false,
  },
  {
    from: 'Unpaid',
    to: 'Carried forward',
    action: 'carry_forward',
    actor: 'system',
    needsReason: false,
  },
  {
    from: 'Unpaid',
    to: 'Paid',
    action: 'settle_zero_balance',
    actor: 'system',
    needsReason: false,
  },
];

/** Paid and Carried forward bills cannot change status again. */
export const FINAL_BILL_STATUSES: readonly BillStatus[] = ['Paid', 'Carried forward'];

export function isFinalBillStatus(status: BillStatus): boolean {
  return FINAL_BILL_STATUSES.includes(status);
}

/** Returns actions available to a particular actor for a bill. */
export function allowedBillTransitions(from: BillStatus, actor: BillActor): BillTransition[] {
  return BILL_TRANSITIONS.filter(
    (transition) => transition.from === from && transition.actor === actor,
  );
}

/**
 * Validates a bill status transition before it is saved.
 * Additional payment and carry-forward conditions must be
 * checked by the calling service.
 */
export function checkBillTransition(
  from: BillStatus,
  to: BillStatus,
  actor: BillActor,
  action: BillAction,
  reason?: string | null,
): BillTransition {
  const transition = BILL_TRANSITIONS.find(
    (item) => item.from === from && item.to === to && item.action === action,
  );

  if (!transition) {
    throw new AppError('CONFLICT', `A bill cannot go from ${from} to ${to} using ${action}.`, {
      from,
      to,
      action,
    });
  }

  if (transition.actor !== actor) {
    const expectedActor =
      transition.actor === 'system' || transition.actor === 'gateway'
        ? transition.actor
        : ROLE_LABELS[transition.actor].toLowerCase();

    throw new AppError('FORBIDDEN', `Only the ${expectedActor} can perform ${action}.`, {
      from,
      to,
      actor,
      action,
    });
  }

  if (transition.needsReason && !reason?.trim()) {
    throw new AppError('BAD_REQUEST', 'Give a reason.', {
      from,
      to,
      action,
    });
  }

  return transition;
}
