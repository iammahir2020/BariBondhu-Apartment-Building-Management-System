/**
 * What a household sees of its bills (RES-01, UC-R04, UC-R08): the bills on Dues with their lines, whether Pay is
 * offered, why the last payment didn't go through, and the receipt of a Paid bill. Only the signed-in household's
 * own bills are shown, never an earlier household's in the same flat (BR-09, TC-R01-22).
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import type { BillLineItem, OverpaymentStatus, Profile } from '@/models';
import type { BillStatus } from '@/services/billStateMachine';

/** Error text, worded as the SRS asks (NFR-25). */
export const MY_BILL_ERRORS = {
  household: 'Only a household account has bills to pay.',
  notFound: 'This bill does not exist.',
  notYours: "This isn't your household's bill.",
  notPaid: "This bill isn't paid yet, so it has no receipt.",
} as const;

/** One line of a bill, as Dues and the receipt show it. */
export interface BillLineView {
  type: BillLineItem['type'];
  amountPoisha: number;
  description: string | null;
}

/** A bill as the store reads it, with what Dues needs around it. */
export interface MyBillRow {
  id: string;
  occupancyId: string | null;
  /** First day of the month, `YYYY-MM-01`. */
  billingMonth: string;
  dueDate: string;
  totalPoisha: number;
  status: BillStatus;
  lines: BillLineView[];
  /** The bill's newest payment, or null if none was ever started. */
  latestPayment: {
    gatewayTransactionId: string;
    endedAt: Date | null;
    endReason: string | null;
  } | null;
  /** The receipt, once the bill is Paid. */
  receipt: { number: number; paidAt: Date } | null;
  /** Money paid again after the bill was settled (BR-04), and whether the manager has refunded it. */
  overpayments: OverpaymentNotice[];
}

/** An overpayment on one of my bills, as Dues tells the household about it. */
export interface OverpaymentNotice {
  amountPoisha: number;
  status: OverpaymentStatus;
  /** When the manager marked it Refunded, or null while Flagged. */
  refundedAt: Date | null;
}

/** A bill with what its receipt prints. */
export interface ReceiptRow extends MyBillRow {
  /** Like `Block A, Flat 3B`. */
  flatLabel: string;
  /** The payment that paid it. */
  paidBy: { gatewayTransactionId: string; amountPoisha: number } | null;
}

/** Where my bills are read from. */
export interface MyBillStore {
  /** Every bill of one occupancy, in any order. */
  listForOccupancy(occupancyId: string): Promise<MyBillRow[]>;
  /** One bill with its receipt details, or null if there is none with this id. */
  findForReceipt(billId: string): Promise<ReceiptRow | null>;
}

/** A bill on Dues. */
export interface MyBillView {
  id: string;
  billingMonth: string;
  dueDate: string;
  totalPoisha: number;
  status: BillStatus;
  lines: BillLineView[];
  /** Pay and Record cash payment are offered only for an Unpaid bill (BR-03, TC-R01-03). */
  canPay: boolean;
  /** Why the last payment ended without money, while the bill is Unpaid again (RES-01 c5, TC-R01-17). */
  paymentProblem: string | null;
  /** The receipt number of a Paid bill, like `R-2611-0101`. */
  receiptNumber: string | null;
  /** Money paid again for this bill after it was settled, so Dues can say it will be, or was, returned. */
  overpayments: OverpaymentNotice[];
}

/** A receipt, as UC-R08 lists it. */
export interface ReceiptView {
  receiptNumber: string;
  flatLabel: string;
  billingMonth: string;
  lines: BillLineView[];
  totalPoisha: number;
  paidAt: Date;
  method: 'Online';
  gatewayTransactionId: string;
}

/**
 * The receipt number as printed.
 * @param number - The number the database gave the receipt.
 * @param billingMonth - The bill's month, `YYYY-MM-01`.
 * @returns `R-`, the bill's year and month, and the number with at least four digits, like `R-2611-0101` for
 * receipt 101 of a November 2026 bill (as in the prototype's Dues screen).
 */
export function formatReceiptNumber(number: number, billingMonth: string): string {
  const yearMonth = `${billingMonth.slice(2, 4)}${billingMonth.slice(5, 7)}`;
  return `R-${yearMonth}-${String(number).padStart(4, '0')}`;
}

function toView(row: MyBillRow): MyBillView {
  const unpaid = row.status === 'Unpaid';
  return {
    id: row.id,
    billingMonth: row.billingMonth,
    dueDate: row.dueDate,
    totalPoisha: row.totalPoisha,
    status: row.status,
    lines: row.lines,
    canPay: unpaid,
    paymentProblem: unpaid && row.latestPayment?.endedAt ? row.latestPayment.endReason : null,
    receiptNumber:
      row.status === 'Paid' && row.receipt
        ? formatReceiptNumber(row.receipt.number, row.billingMonth)
        : null,
    overpayments: row.overpayments,
  };
}

/**
 * My household's bills, newest month first (TC-R01-01).
 * @param store - Where bills are read from.
 * @param resident - The signed-in household account.
 * @returns The bills as Dues shows them.
 * @throws AppError 403 if the account has no household.
 */
export async function listMyBills(store: MyBillStore, resident: Profile): Promise<MyBillView[]> {
  if (resident.occupancyId === null) throw new AppError('FORBIDDEN', MY_BILL_ERRORS.household);
  const rows = await store.listForOccupancy(resident.occupancyId);
  return rows
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
    .map((row) => toView(row));
}

/**
 * The receipt of a Paid bill (UC-R08, TC-R01-18). A resident gets only their own household's; the manager any.
 * @param store - Where bills are read from.
 * @param viewer - The signed-in user and whether they see their own bills or all of them.
 * @param billId - The bill.
 * @returns The receipt.
 * @throws AppError 404 if there is no such bill.
 * @throws AppError 403 if a resident asks for another household's bill (TC-R01-20).
 * @throws AppError 409 if the bill isn't Paid, so it has no receipt (TC-R01-19).
 */
export async function getReceipt(
  store: MyBillStore,
  viewer: { actor: Profile; scope: 'own' | 'all' },
  billId: string,
): Promise<ReceiptView> {
  const row = await store.findForReceipt(billId);
  if (!row) throw new AppError('NOT_FOUND', MY_BILL_ERRORS.notFound);
  if (
    viewer.scope === 'own' &&
    (row.occupancyId === null || row.occupancyId !== viewer.actor.occupancyId)
  ) {
    throw new AppError('FORBIDDEN', MY_BILL_ERRORS.notYours);
  }
  if (row.status !== 'Paid' || !row.receipt || !row.paidBy) {
    throw new AppError('CONFLICT', MY_BILL_ERRORS.notPaid, { status: row.status });
  }
  return {
    receiptNumber: formatReceiptNumber(row.receipt.number, row.billingMonth),
    flatLabel: row.flatLabel,
    billingMonth: row.billingMonth,
    lines: row.lines,
    totalPoisha: row.totalPoisha,
    paidAt: row.receipt.paidAt,
    method: 'Online',
    gatewayTransactionId: row.paidBy.gatewayTransactionId,
  };
}
