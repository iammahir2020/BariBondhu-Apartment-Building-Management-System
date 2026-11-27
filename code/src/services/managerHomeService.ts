/**
 * The counts on the building manager's home (BM-01 lands here; prototype `M-Dashboard.html`, short version, BB-0010):
 * the latest month's bills and how many are paid, open, late and overdue tickets (BM-06, BM-07), expenses waiting
 * for the committee (BM-08) and overpayments still to refund (BR-04). Each count comes from data the manager may
 * already see.
 *
 * @author Mahir Al Kamal
 */
import type { Bill, Expense, Overpayment, Ticket } from '@/models';

/** A ticket waits this long with nobody assigned before it counts as late (BM-06). */
export const LATE_AFTER_MS = 24 * 60 * 60 * 1000;

/** An Urgent ticket counts as late much sooner (BM-06). */
export const URGENT_LATE_AFTER_MS = 60 * 60 * 1000;

/** States a ticket can no longer leave. Every other state is open. */
const FINAL_TICKET_STATES: ReadonlySet<Ticket['status']> = new Set([
  'Closed',
  'Cancelled',
  'Duplicate',
  "Won't fix",
]);

/** States in which an assigned ticket is still being worked on, so a passed due date makes it overdue. */
const WORK_STATES: ReadonlySet<Ticket['status']> = new Set(['Assigned', 'In progress', 'On hold']);

/** The ticket fields the home needs. */
export type HomeTicket = Pick<
  Ticket,
  'status' | 'priority' | 'assigneeId' | 'dueDate' | 'createdAt'
>;

/** The bill fields the home needs. */
export type HomeBill = Pick<Bill, 'billingMonth' | 'totalPoisha' | 'status'>;

/** Reads what the manager's home counts. */
export interface ManagerHomeStore {
  /** Every bill of the newest billing month (empty when no bills exist yet). */
  latestMonthBills(): Promise<HomeBill[]>;
  /** Every ticket that is not in a final state. */
  openTickets(): Promise<HomeTicket[]>;
  /** Every expense waiting for the committee's decision. */
  waitingExpenses(): Promise<Pick<Expense, 'amountPoisha'>[]>;
  /** Every overpayment still Flagged. */
  flaggedOverpayments(): Promise<Pick<Overpayment, 'amountPoisha'>[]>;
}

/** The newest month's bills. */
export interface BillsSummary {
  /** First day of the month, `YYYY-MM-DD`, or null when no bills exist yet. */
  month: string | null;
  /** Bills made for that month, leaving out any carried forward to a newer bill. */
  billed: number;
  /** Of those, how many are Paid. */
  paid: number;
  /** Total of those bills, in poisha. */
  billedPoisha: number;
  /** Total of the Paid ones, in poisha. */
  paidPoisha: number;
}

/** Open tickets and the ones that need the manager now. */
export interface TicketsSummary {
  /** Tickets not yet Closed, Cancelled, Duplicate or Won't fix. */
  open: number;
  /** Reported with nobody assigned for over 24 hours, or over 1 hour if Urgent (BM-06). */
  lateUnassigned: number;
  /** Assigned, In progress or On hold, with the due date passed (Dhaka date). */
  overdue: number;
  /** Open tickets marked Urgent. */
  urgent: number;
}

/** A count and its total amount. */
export interface MoneyCount {
  /** How many. */
  count: number;
  /** Their total, in poisha. */
  totalPoisha: number;
}

/** Everything on the manager's home. */
export interface ManagerHomeSummary {
  bills: BillsSummary;
  tickets: TicketsSummary;
  /** Expenses waiting for the committee (BM-08, CM-02). */
  waitingExpenses: MoneyCount;
  /** Overpayments still to refund (BR-04). */
  flaggedOverpayments: MoneyCount;
}

/**
 * Today's date in Asia/Dhaka (BR-01).
 * @param now - The current time.
 * @returns `YYYY-MM-DD`.
 */
function todayInDhaka(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

/**
 * Sums the newest month's bills. A Carried forward bill is left out, because its amount is already on a newer bill
 * (BR-05).
 * @param bills - The bills of one month.
 * @returns The month, how many bills and how many are Paid, with their totals.
 */
export function summarizeBills(bills: readonly HomeBill[]): BillsSummary {
  const counted = bills.filter((bill) => bill.status !== 'Carried forward');
  const paid = counted.filter((bill) => bill.status === 'Paid');
  const sum = (list: readonly HomeBill[]) =>
    list.reduce((total, bill) => total + bill.totalPoisha, 0);
  return {
    month: bills[0]?.billingMonth ?? null,
    billed: counted.length,
    paid: paid.length,
    billedPoisha: sum(counted),
    paidPoisha: sum(paid),
  };
}

/**
 * Whether a ticket has waited too long with nobody assigned (BM-06): Reported for over 24 hours, or over 1 hour if
 * Urgent.
 * @param ticket - The ticket.
 * @param now - The current time.
 * @returns True when the manager should assign it now.
 */
export function isLateUnassigned(ticket: HomeTicket, now: Date): boolean {
  if (ticket.status !== 'Reported' || ticket.assigneeId !== null) return false;
  const limit = ticket.priority === 'Urgent' ? URGENT_LATE_AFTER_MS : LATE_AFTER_MS;
  return now.getTime() - ticket.createdAt.getTime() > limit;
}

/**
 * Whether an assigned ticket is past its due date and still being worked on.
 * @param ticket - The ticket.
 * @param now - The current time; the due date is compared with today's Dhaka date.
 * @returns True when the due date has passed.
 */
export function isOverdue(ticket: HomeTicket, now: Date): boolean {
  return (
    WORK_STATES.has(ticket.status) && ticket.dueDate !== null && ticket.dueDate < todayInDhaka(now)
  );
}

/**
 * Counts open, late, overdue and Urgent tickets. Tickets in a final state are skipped, so the store may pass more.
 * @param tickets - The tickets.
 * @param now - The current time.
 * @returns The counts.
 */
export function summarizeTickets(tickets: readonly HomeTicket[], now: Date): TicketsSummary {
  const open = tickets.filter((ticket) => !FINAL_TICKET_STATES.has(ticket.status));
  return {
    open: open.length,
    lateUnassigned: open.filter((ticket) => isLateUnassigned(ticket, now)).length,
    overdue: open.filter((ticket) => isOverdue(ticket, now)).length,
    urgent: open.filter((ticket) => ticket.priority === 'Urgent').length,
  };
}

/**
 * Counts rows and adds up their amounts.
 * @param rows - Rows with an amount in poisha.
 * @returns How many and their total.
 */
export function countMoney(rows: readonly { amountPoisha: number }[]): MoneyCount {
  return {
    count: rows.length,
    totalPoisha: rows.reduce((total, row) => total + row.amountPoisha, 0),
  };
}

/**
 * Builds the manager's home from the store.
 * @param store - Where the bills, tickets, expenses and overpayments come from.
 * @param now - The current time, for late and overdue tickets.
 * @returns The counts for every card.
 */
export async function getManagerHomeSummary(
  store: ManagerHomeStore,
  now: Date,
): Promise<ManagerHomeSummary> {
  const [bills, tickets, expenses, overpayments] = await Promise.all([
    store.latestMonthBills(),
    store.openTickets(),
    store.waitingExpenses(),
    store.flaggedOverpayments(),
  ]);
  return {
    bills: summarizeBills(bills),
    tickets: summarizeTickets(tickets, now),
    waitingExpenses: countMoney(expenses),
    flaggedOverpayments: countMoney(overpayments),
  };
}
