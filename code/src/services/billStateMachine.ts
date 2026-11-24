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

/** Creates a transition with consistent fields. */
function transition(
  from: BillStatus,
  to: BillStatus,
  action: BillAction,
  actor: BillActor,
  needsReason = false,
): BillTransition {
  return { from, to, action, actor, needsReason };
}

/**
 * Allowed transitions; anything not listed is rejected.
 *
 * The system may confirm a payment after a successful gateway re-check.
 * The manager may settle a zero-balance bill after a correction.
 */
export const BILL_TRANSITIONS: readonly BillTransition[] = [
  transition('Unpaid', 'Payment pending', 'start_online_payment', 'resident'),
  transition('Payment pending', 'Paid', 'confirm_online_payment', 'gateway'),
  transition('Payment pending', 'Paid', 'confirm_online_payment', 'system'),
  transition('Unpaid', 'Paid', 'confirm_online_payment', 'gateway'),
  transition('Payment pending', 'Unpaid', 'fail_online_payment', 'system'),
  transition('Unpaid', 'Awaiting verification', 'submit_payment_claim', 'resident'),
  transition('Awaiting verification', 'Paid', 'accept_payment_claim', 'manager'),
  transition('Awaiting verification', 'Unpaid', 'reject_payment_claim', 'manager', true),
  transition('Unpaid', 'Paid', 'record_direct_payment', 'manager'),
  transition('Unpaid', 'Carried forward', 'carry_forward', 'system'),
  transition('Unpaid', 'Paid', 'settle_zero_balance', 'system'),
  transition('Unpaid', 'Paid', 'settle_zero_balance', 'manager'),
];

/** Paid and Carried forward bills cannot change status again. */
export const FINAL_BILL_STATUSES: readonly BillStatus[] = ['Paid', 'Carried forward'];

/**
 * Checks whether a bill has reached a final status.
 *
 * @param status - The current status of the bill.
 * @returns True if the bill is Paid or Carried forward; otherwise, false.
 */
export function isFinalBillStatus(status: BillStatus): boolean {
  return FINAL_BILL_STATUSES.includes(status);
}

/** Returns actions available to a particular actor for a bill. */
export function allowedBillTransitions(from: BillStatus, actor: BillActor): BillTransition[] {
  return BILL_TRANSITIONS.filter((item) => item.from === from && item.actor === actor);
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
  const matchingTransitions = BILL_TRANSITIONS.filter(
    (item) => item.from === from && item.to === to && item.action === action,
  );

  if (matchingTransitions.length === 0) {
    throw new AppError('CONFLICT', `A bill cannot go from ${from} to ${to} using ${action}.`, {
      from,
      to,
      action,
    });
  }

  const selectedTransition = matchingTransitions.find((item) => item.actor === actor);

  if (!selectedTransition) {
    const expectedActors = [
      ...new Set(
        matchingTransitions.map((item) =>
          item.actor === 'system' || item.actor === 'gateway'
            ? item.actor
            : ROLE_LABELS[item.actor].toLowerCase(),
        ),
      ),
    ].join(' or ');

    throw new AppError('FORBIDDEN', `Only the ${expectedActors} can perform ${action}.`, {
      from,
      to,
      actor,
      action,
    });
  }

  if (selectedTransition.needsReason && !reason?.trim()) {
    throw new AppError('BAD_REQUEST', 'Give a reason.', {
      from,
      to,
      action,
    });
  }

  return selectedTransition;
}
