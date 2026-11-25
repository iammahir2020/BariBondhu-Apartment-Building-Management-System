/**
 * What the manager's home shows (BB-0010), worked out from the counts: the "Needs you now" items and the line under
 * each total. Kept apart from the page so the wording is tested on its own.
 *
 * @author Mahir Al Kamal
 */
import { formatBillMonth } from '@/components/payments/billView';
import { formatTaka } from '@/lib/money';
import type { ManagerHomeSummary } from '@/services/managerHomeService';

/**
 * The manager pages that exist so far. A card links to its page only once the page is built, so the home never has
 * a dead link. When your page merges, set its path here.
 */
export const MANAGER_PAGES = {
  tickets: null,
  bills: null,
  expenses: '/manager/expenses',
  overpayments: '/manager/overpayments',
} as const satisfies Record<string, string | null>;

/** How loud a "Needs you now" item is. */
export type NeedTone = 'bad' | 'warn' | 'info';

/** One item under "Needs you now". */
export interface Need {
  /** What needs doing, like `2 late tickets, nobody assigned`. */
  title: string;
  /** One more line of detail. */
  detail: string;
  tone: NeedTone;
  /** Page to open, or null until that page exists. */
  href: string | null;
}

/**
 * A count with its noun, singular or plural.
 * @param count - How many.
 * @param one - The noun for one, like `ticket`.
 * @param many - The noun for more than one; defaults to `one` with an s.
 * @returns Like `1 ticket` or `3 tickets`.
 */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The things the manager should act on now, most urgent first. Empty when nothing needs them.
 * @param summary - The home counts.
 * @returns The items to show.
 */
export function managerNeeds(summary: ManagerHomeSummary): Need[] {
  const needs: Need[] = [];
  const { tickets, flaggedOverpayments } = summary;
  if (tickets.lateUnassigned > 0) {
    needs.push({
      title: `${plural(tickets.lateUnassigned, 'late ticket')}, nobody assigned`,
      detail:
        tickets.urgent > 0
          ? `${plural(tickets.urgent, 'urgent ticket')} open`
          : 'Waiting over 24 hours (1 hour if urgent)',
      tone: 'bad',
      href: MANAGER_PAGES.tickets,
    });
  }
  if (tickets.overdue > 0) {
    needs.push({
      title: plural(tickets.overdue, 'overdue ticket'),
      detail: 'Past the due date and not fixed yet',
      tone: 'warn',
      href: MANAGER_PAGES.tickets,
    });
  }
  if (flaggedOverpayments.count > 0) {
    needs.push({
      title: `${plural(flaggedOverpayments.count, 'overpayment')} to refund`,
      detail: `${formatTaka(flaggedOverpayments.totalPoisha)} paid twice, to return outside the app`,
      tone: 'info',
      href: MANAGER_PAGES.overpayments,
    });
  }
  return needs;
}

/**
 * The bills total: what has been paid for the newest month.
 * @param summary - The home counts.
 * @returns The label, the big number and the line under it.
 */
export function billsTotal(summary: ManagerHomeSummary): {
  label: string;
  value: string;
  line: string;
} {
  const { bills } = summary;
  if (bills.month === null) return { label: 'Bills', value: '—', line: 'No bills made yet' };
  return {
    label: `Paid for ${formatBillMonth(bills.month).split(' ')[0]}`,
    value: formatTaka(bills.paidPoisha),
    line: `${bills.paid} of ${plural(bills.billed, 'bill')} paid · ${formatTaka(bills.billedPoisha)} billed`,
  };
}

/**
 * The line under the open tickets total.
 * @param summary - The home counts.
 * @returns Like `2 overdue` or `None overdue`.
 */
export function ticketsLine(summary: ManagerHomeSummary): string {
  return summary.tickets.overdue > 0 ? `${summary.tickets.overdue} overdue` : 'None overdue';
}
