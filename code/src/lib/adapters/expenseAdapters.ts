/**
 * Database adapter for `expenseService.ts`: reads and writes the `expenses` table. Connection code only; the rules
 * are in the service.
 *
 * @author Ayesha Siddiqa
 */
import { desc, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { expenses } from '@/models';
import type { ExpenseStore } from '@/services/expenseService';

/**
 * An {@link ExpenseStore} backed by the `expenses` table.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseExpenseStore(db: Database): ExpenseStore {
  return {
    async findById(id) {
      const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      return rows[0];
    },
    async insert(expense) {
      const [row] = await db.insert(expenses).values(expense).returning();
      if (!row) throw new Error('Expense insert returned no row.');
      return row;
    },
    async update(id, changes) {
      const [row] = await db.update(expenses).set(changes).where(eq(expenses.id, id)).returning();
      if (!row) throw new Error('Expense update returned no row.');
      return row;
    },
    async list() {
      return db.select().from(expenses).orderBy(desc(expenses.createdAt));
    },
  };
}
