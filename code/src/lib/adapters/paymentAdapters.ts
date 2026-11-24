/**
 * Database adapters for paying bills online (`paymentService.ts`) and for what a household sees of its bills
 * (`myBillsService.ts`). Connection code only; the rules are in the services. Every change that touches more than one
 * row runs in one transaction, and every status change is conditional on the status the service saw, so two requests
 * can't both win.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { databaseSimulatedGateway } from '@/lib/adapters/gatewayAdapters';
import type { Database } from '@/lib/db';
import {
  billLineItems,
  bills,
  blocks,
  flats,
  overpayments,
  payments,
  receipts,
  type Payment,
} from '@/models';
import { databaseAuditWriter } from '@/services/auditService';
import type { MyBillRow, MyBillStore, ReceiptRow } from '@/services/myBillsService';
import type { PaymentDeps, PaymentStore } from '@/services/paymentService';

/**
 * Everything the payment service needs, wired to the database and the simulated gateway (SRS v1.6).
 * @param db - Database to use.
 * @returns The payment service's dependencies.
 */
export function databasePaymentDeps(db: Database): PaymentDeps {
  return {
    payments: databasePaymentStore(db),
    gateway: databaseSimulatedGateway(db),
    audit: databaseAuditWriter(db),
  };
}

/** The condition for a payment that is neither confirmed nor ended. */
const isOpen = and(isNull(payments.confirmedAt), isNull(payments.endedAt));

/**
 * A {@link PaymentStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databasePaymentStore(db: Database): PaymentStore {
  return {
    async findBill(billId) {
      const [bill] = await db
        .select({
          id: bills.id,
          occupancyId: bills.occupancyId,
          status: bills.status,
          totalPoisha: bills.totalPoisha,
        })
        .from(bills)
        .where(eq(bills.id, billId));
      return bill ?? null;
    },

    async startIfUnpaid(payment) {
      return db.transaction(async (tx) => {
        const moved = await tx
          .update(bills)
          .set({ status: 'Payment pending', updatedAt: payment.startedAt })
          .where(and(eq(bills.id, payment.billId), eq(bills.status, 'Unpaid')))
          .returning({ id: bills.id });
        if (moved.length === 0) return false;
        await tx.insert(payments).values(payment);
        return true;
      });
    },

    async findPaymentByTransaction(transactionId) {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.gatewayTransactionId, transactionId));
      return payment ?? null;
    },

    async payIfStatus({ paymentId, billId, amountPoisha, at, from }) {
      return db.transaction(async (tx) => {
        const moved = await tx
          .update(bills)
          .set({ status: 'Paid', updatedAt: at })
          .where(and(eq(bills.id, billId), eq(bills.status, from)))
          .returning({ id: bills.id });
        if (moved.length === 0) return null;
        await tx
          .update(payments)
          .set({ confirmedAt: at, endedAt: null, endReason: null })
          .where(eq(payments.id, paymentId));
        const [receipt] = await tx
          .insert(receipts)
          .values({ billId, paymentId, amountPoisha, paidAt: at })
          .returning({ number: receipts.number });
        if (!receipt) throw new Error('Receipt insert returned no row.');
        return receipt.number;
      });
    },

    async flagOverpayment({ paymentId, billId, amountPoisha, at }) {
      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ confirmedAt: at, endedAt: null, endReason: null })
          .where(eq(payments.id, paymentId));
        await tx.insert(overpayments).values({ billId, paymentId, amountPoisha, flaggedAt: at });
      });
    },

    async endIfOpen({ paymentId, billId, reason, at }) {
      return db.transaction(async (tx) => {
        const ended = await tx
          .update(payments)
          .set({ endedAt: at, endReason: reason })
          .where(and(eq(payments.id, paymentId), isOpen))
          .returning({ id: payments.id });
        if (ended.length === 0) return false;
        await tx
          .update(bills)
          .set({ status: 'Unpaid', updatedAt: at })
          .where(and(eq(bills.id, billId), eq(bills.status, 'Payment pending')));
        return true;
      });
    },

    async openPaymentsStartedBy(cutoff) {
      return db
        .select()
        .from(payments)
        .where(and(isOpen, lte(payments.startedAt, cutoff)))
        .orderBy(payments.startedAt);
    },
  };
}

/** The bill columns Dues and the receipt read. */
type BillColumns = Pick<
  MyBillRow,
  'id' | 'occupancyId' | 'billingMonth' | 'dueDate' | 'totalPoisha' | 'status'
>;

/** Reads the lines, newest payment and receipt of some bills, and puts them together with the bills. */
async function withDetails(
  db: Database,
  bills: BillColumns[],
): Promise<(MyBillRow & Pick<ReceiptRow, 'paidBy'>)[]> {
  if (bills.length === 0) return [];
  const ids = bills.map((bill) => bill.id);
  const [lines, paymentRows, receiptRows] = await Promise.all([
    db
      .select()
      .from(billLineItems)
      .where(inArray(billLineItems.billId, ids))
      .orderBy(billLineItems.createdAt),
    db
      .select()
      .from(payments)
      .where(inArray(payments.billId, ids))
      .orderBy(desc(payments.startedAt)),
    db.select().from(receipts).where(inArray(receipts.billId, ids)),
  ]);

  return bills.map((bill) => {
    const latest: Payment | undefined = paymentRows.find((p) => p.billId === bill.id);
    const receipt = receiptRows.find((r) => r.billId === bill.id);
    const paying = receipt ? paymentRows.find((p) => p.id === receipt.paymentId) : undefined;
    return {
      ...bill,
      lines: lines
        .filter((line) => line.billId === bill.id)
        .map(({ type, amountPoisha, description }) => ({ type, amountPoisha, description })),
      latestPayment: latest
        ? {
            gatewayTransactionId: latest.gatewayTransactionId,
            endedAt: latest.endedAt,
            endReason: latest.endReason,
          }
        : null,
      receipt: receipt ? { number: receipt.number, paidAt: receipt.paidAt } : null,
      paidBy: paying
        ? { gatewayTransactionId: paying.gatewayTransactionId, amountPoisha: paying.amountPoisha }
        : null,
    };
  });
}

const BILL_COLUMNS = {
  id: bills.id,
  occupancyId: bills.occupancyId,
  billingMonth: bills.billingMonth,
  dueDate: bills.dueDate,
  totalPoisha: bills.totalPoisha,
  status: bills.status,
};

/**
 * A {@link MyBillStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseMyBillStore(db: Database): MyBillStore {
  return {
    async listForOccupancy(occupancyId) {
      const rows = await db
        .select(BILL_COLUMNS)
        .from(bills)
        .where(eq(bills.occupancyId, occupancyId));
      return withDetails(db, rows);
    },

    async findForReceipt(billId) {
      const [row] = await db
        .select({ ...BILL_COLUMNS, blockName: blocks.name, flatNumber: flats.number })
        .from(bills)
        .innerJoin(flats, eq(bills.flatId, flats.id))
        .innerJoin(blocks, eq(flats.blockId, blocks.id))
        .where(eq(bills.id, billId));
      if (!row) return null;
      const { blockName, flatNumber, ...bill } = row;
      const [detailed] = await withDetails(db, [bill]);
      if (!detailed) return null;
      return { ...detailed, flatLabel: `${blockName}, Flat ${flatNumber}` };
    },
  };
}
