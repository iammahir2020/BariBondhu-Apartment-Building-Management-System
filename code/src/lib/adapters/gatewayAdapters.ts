/**
 * Database adapters for the simulated payment gateway (`simulatedGateway.ts`): its transactions in the
 * `gateway_transactions` table. Connection code only; the gateway's rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { gatewayTransactions } from '@/models';
import {
  simulatedGateway,
  type GatewayTransactionStore,
  type SimulatedGateway,
} from '@/services/simulatedGateway';

/**
 * The simulated gateway, wired to the database. The payment services take it as their `PaymentGateway`.
 * @param db - Database to use.
 * @returns The gateway.
 */
export function databaseSimulatedGateway(db: Database): SimulatedGateway {
  return simulatedGateway({ transactions: databaseGatewayTransactionStore(db) });
}

/**
 * A {@link GatewayTransactionStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseGatewayTransactionStore(db: Database): GatewayTransactionStore {
  return {
    async insert(transaction) {
      await db.insert(gatewayTransactions).values(transaction);
    },

    async findById(id) {
      const [row] = await db
        .select()
        .from(gatewayTransactions)
        .where(eq(gatewayTransactions.id, id));
      return row ?? null;
    },

    async decideIfPending(id, state, reason, at) {
      const updated = await db
        .update(gatewayTransactions)
        .set({ state, reason, decidedAt: at })
        .where(and(eq(gatewayTransactions.id, id), eq(gatewayTransactions.state, 'Pending')))
        .returning({ id: gatewayTransactions.id });
      return updated.length > 0;
    },
  };
}
