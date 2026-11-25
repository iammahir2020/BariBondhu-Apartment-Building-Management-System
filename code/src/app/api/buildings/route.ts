/**
 * The building setup for the system administrator's home (ADM-01, BB-0012): the building, its blocks and flats, and
 * the manager account. Read only in Release 1. The role check is the first line.
 *
 * @author Mahir Al Kamal
 */
import { databaseBuildingSetupStore } from '@/lib/adapters/buildingSetupAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { toErrorResponse } from '@/lib/errors';
import { getBuildingSetup } from '@/services/buildingSetupService';

/**
 * Returns the building setup.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with the setup, or an error (401 signed out, 403 not the administrator).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'setUpBuilding');
    const setup = await getBuildingSetup(databaseBuildingSetupStore(db));
    return Response.json(setup);
  } catch (error) {
    return toErrorResponse(error);
  }
}
