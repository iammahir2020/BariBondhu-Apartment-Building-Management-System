/**
 * How Dues and the Receipt show a bill (RES-01): the name of each line, the month and dates, and the status badge,
 * worded as in the prototype's `R-Dues.html`.
 *
 * @author Mahir Al Kamal
 */
import type { BillStatus } from '@/services/billStateMachine';
import type { BillLineView, MyBillView } from '@/services/myBillsService';

/** The name of each kind of line. */
export const LINE_LABELS: Readonly<Record<BillLineView['type'], string>> = {
  service: 'Service charge',
  generator: 'Generator',
  water: 'Water',
  carried_forward: 'Carried forward',
  adjustment: 'Adjustment',
  credit: 'Credit',
};

/** The badge colour and words for each bill status. */
export const BILL_STATUS_BADGE: Readonly<
  Record<BillStatus, { variant: 'warn' | 'info' | 'ok' | 'mute'; label: string }>
> = {
  Unpaid: { variant: 'warn', label: 'Unpaid' },
  'Payment pending': { variant: 'info', label: 'Payment pending' },
  'Awaiting verification': { variant: 'info', label: 'Awaiting verification' },
  Paid: { variant: 'ok', label: 'Paid' },
  'Carried forward': { variant: 'mute', label: 'Carried forward' },
};

const DHAKA = 'Asia/Dhaka';

/**
 * A line's name, with the reason of an adjustment.
 * @param line - The line.
 * @returns Like `Service charge`, or `Adjustment: water meter misread`.
 */
export function lineLabel(line: BillLineView): string {
  const label = LINE_LABELS[line.type];
  return line.type === 'adjustment' && line.description ? `${label}: ${line.description}` : label;
}

/**
 * A bill's month.
 * @param billingMonth - `YYYY-MM-01`.
 * @returns Like `November 2026`.
 */
export function formatBillMonth(billingMonth: string): string {
  return new Date(`${billingMonth}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A date such as a due date.
 * @param day - `YYYY-MM-DD`.
 * @returns Like `20 Nov 2026`.
 */
export function formatBillDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A moment, in Dhaka time.
 * @param at - The moment, as a date or the ISO text the API sends.
 * @returns Like `25 Nov 2026, 10:02 am`.
 */
export function formatBillMoment(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at;
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DHAKA,
  });
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DHAKA })
    .toLowerCase();
  return `${day}, ${time}`;
}

/** Statuses a bill can't be paid from again. */
const SETTLED: readonly BillStatus[] = ['Paid', 'Carried forward'];

/**
 * The bill to pay now, as Dues and Resident home both show it.
 * @param bills - My household's bills, newest first, as `/api/bills/mine` sends them.
 * @returns The newest bill that isn't Paid or Carried forward, or null when everything is settled.
 */
export function currentBill(bills: readonly MyBillView[]): MyBillView | null {
  return bills.find((bill) => !SETTLED.includes(bill.status)) ?? null;
}

/** One day in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * How long until a bill is due, counted in whole Dhaka days.
 * @param dueDate - `YYYY-MM-DD`.
 * @param now - The moment to count from.
 * @returns Like `5 days left`, `1 day left`, `due today`, `1 day late` or `3 days late`.
 */
export function dueCountdown(dueDate: string, now: Date): string {
  const today = now.toLocaleDateString('en-CA', { timeZone: DHAKA });
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  if (days === 0) return 'due today';
  const count = Math.abs(days);
  const unit = count === 1 ? 'day' : 'days';
  return days > 0 ? `${count} ${unit} left` : `${count} ${unit} late`;
}
