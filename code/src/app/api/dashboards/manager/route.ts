/**
 * The counts on the building manager's home (`/manager`, BM-01, BB-0010): bills, tickets, waiting expenses and
 * overpayments to refund. The role check is the first line.
 *
 * @author Mahir Al Kamal
 */
import { databaseManagerHomeStore } from '@/lib/adapters/managerHomeAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { getManagerHomeSummary } from '@/services/managerHomeService';

/**
 * Returns the manager's home counts.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with the summary, or an error (401 signed out, 403 not the manager).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewManagerDashboard');
    const summary = await getManagerHomeSummary(databaseManagerHomeStore(db), new Date());
    return Response.json(summary);
  } catch (error) {
    return toErrorResponse(error);
  }
}
