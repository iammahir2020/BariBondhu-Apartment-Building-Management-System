/**
 * Lists the manager's building-scoped tickets and active maintenance staff options (BM-06, BB-1306).
 *
 * @author Jannatul Ferdus Nishi
 */
import { databaseManagerTicketContext } from '@/lib/adapters/managerTicketAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import {
  listManagerMaintenanceStaff,
  listManagerTickets,
} from '@/services/managerTicketQueryService';

/**
 * Returns all in-scope tickets and active staff for the assignment form.
 * @param request - Incoming request.
 * @returns 200 with `{ tickets, maintenanceStaff }`, or a role/scope error.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'manageTickets');
    const context = await databaseManagerTicketContext(db);
    const [tickets, maintenanceStaff] = await Promise.all([
      listManagerTickets(context.tickets),
      listManagerMaintenanceStaff(context.tickets),
    ]);
    return Response.json({ tickets, maintenanceStaff });
  } catch (error) {
    return toErrorResponse(error);
  }
}
