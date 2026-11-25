/**
 * Database adapter for `managerHomeService.ts`: reads the bills, tickets, expenses and overpayments the manager's
 * home counts. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import { eq, max, notInArray } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { bills, expenses, overpayments, tickets } from '@/models';
import type { ManagerHomeStore } from '@/services/managerHomeService';

/**
 * A {@link ManagerHomeStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseManagerHomeStore(db: Database): ManagerHomeStore {
  return {
    async latestMonthBills() {
      const [latest] = await db.select({ month: max(bills.billingMonth) }).from(bills);
      if (!latest?.month) return [];
      return db
        .select({
          billingMonth: bills.billingMonth,
          totalPoisha: bills.totalPoisha,
          status: bills.status,
        })
        .from(bills)
        .where(eq(bills.billingMonth, latest.month));
    },
    async openTickets() {
      return db
        .select({
          status: tickets.status,
          priority: tickets.priority,
          assigneeId: tickets.assigneeId,
          dueDate: tickets.dueDate,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .where(notInArray(tickets.status, ['Closed', 'Cancelled', 'Duplicate', "Won't fix"]));
    },
    async waitingExpenses() {
      return db
        .select({ amountPoisha: expenses.amountPoisha })
        .from(expenses)
        .where(eq(expenses.status, 'Waiting for approval'));
    },
    async flaggedOverpayments() {
      return db
        .select({ amountPoisha: overpayments.amountPoisha })
        .from(overpayments)
        .where(eq(overpayments.status, 'Flagged'));
    },
  };
}
