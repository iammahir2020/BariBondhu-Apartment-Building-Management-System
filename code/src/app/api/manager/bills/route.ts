/**
 * Manager bill management API.
 * BB-0508, BM-03, BR-05, NFR-06.
 *
 * @author Jannatul Ferdus Nishi
 */

import { databaseManagerBillStore } from '@/lib/adapters/managerBillAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { generateBillsWithCarryForward } from '@/services/generateBillsWithCarryForward';

/**
 * List all monthly bills.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'manageBills');

    const bills = await databaseManagerBillStore(db).listBills();

    return Response.json({ bills });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Generate monthly bills and carry forward
 * earlier unpaid balances atomically.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'manageBills');

    const body = await readJsonObject(request);

    const billingMonth = typeof body.billingMonth === 'string' ? body.billingMonth.trim() : '';

    const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';

    if (!billingMonth) {
      throw new AppError('BAD_REQUEST', 'Enter a valid billing month');
    }

    if (!dueDate) {
      throw new AppError('BAD_REQUEST', 'Check the due date');
    }

    const result = await generateBillsWithCarryForward(
      db,
      {
        billingMonth,
        dueDate,
      },
      actor.id,
    );

    return Response.json(result, {
      status: 201,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
