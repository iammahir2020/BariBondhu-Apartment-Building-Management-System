/**
 * Database adapters for the fund summary (BM-12): the figures of a month read from payments, expenses and bills,
 * the saved summaries and the opening balances. Connection code only; the rules are in `fundSummaryService.ts`,
 * `fundPublishService.ts` and `openingBalanceService.ts`.
 *
 * @author Ayesha Siddiqa
 */
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { bills, expenses, fundSummaries, openingBalances, payments } from '@/models';
import type { FundSummaryStore } from '@/services/fundPublishService';
import type { FundFigureStore } from '@/services/fundSummaryService';
import type { OpeningBalanceStore } from '@/services/openingBalanceService';

/**
 * A {@link FundFigureStore} backed by the `payments`, `expenses`, `bills` and `fund_summaries` tables.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseFundFigureStore(db: Database): FundFigureStore {
  return {
    async listConfirmedPayments(from, to) {
      return db
        .select({ amountPoisha: payments.amountPoisha })
        .from(payments)
        .where(and(gte(payments.confirmedAt, from), lt(payments.confirmedAt, to)));
    },
    async listExpensesDated(from, to) {
      return db
        .select({
          amountPoisha: expenses.amountPoisha,
          category: expenses.category,
          status: expenses.status,
        })
        .from(expenses)
        .where(and(gte(expenses.expenseDate, from), lt(expenses.expenseDate, to)));
    },
    async listBillsOfMonth(month) {
      return db
        .select({ totalPoisha: bills.totalPoisha, status: bills.status })
        .from(bills)
        .where(eq(bills.billingMonth, month));
    },
    async findSummaryByMonth(month) {
      const rows = await db
        .select()
        .from(fundSummaries)
        .where(eq(fundSummaries.month, month))
        .limit(1);
      return rows[0];
    },
  };
}

/**
 * A {@link FundSummaryStore} backed by the `fund_summaries` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseFundSummaryStore(db: Database): FundSummaryStore {
  return {
    async findByMonth(month) {
      const rows = await db
        .select()
        .from(fundSummaries)
        .where(eq(fundSummaries.month, month))
        .limit(1);
      return rows[0];
    },
    async insert(summary) {
      const [row] = await db.insert(fundSummaries).values(summary).returning();
      if (!row) throw new Error('Fund summary insert returned no row.');
      return row;
    },
    async update(id, changes) {
      const [row] = await db
        .update(fundSummaries)
        .set(changes)
        .where(eq(fundSummaries.id, id))
        .returning();
      if (!row) throw new Error('Fund summary update returned no row.');
      return row;
    },
    async list() {
      return db.select().from(fundSummaries).orderBy(desc(fundSummaries.month));
    },
  };
}

/**
 * An {@link OpeningBalanceStore} backed by the `opening_balances` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseOpeningBalanceStore(db: Database): OpeningBalanceStore {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(openingBalances)
        .where(eq(openingBalances.id, id))
        .limit(1);
      return rows[0];
    },
    async findByMonth(month) {
      const rows = await db
        .select()
        .from(openingBalances)
        .where(eq(openingBalances.month, month))
        .limit(1);
      return rows[0];
    },
    async insert(balance) {
      const [row] = await db.insert(openingBalances).values(balance).returning();
      if (!row) throw new Error('Opening balance insert returned no row.');
      return row;
    },
    async update(id, changes) {
      const [row] = await db
        .update(openingBalances)
        .set(changes)
        .where(eq(openingBalances.id, id))
        .returning();
      if (!row) throw new Error('Opening balance update returned no row.');
      return row;
    },
    async list() {
      return db.select().from(openingBalances).orderBy(desc(openingBalances.month));
    },
  };
}
