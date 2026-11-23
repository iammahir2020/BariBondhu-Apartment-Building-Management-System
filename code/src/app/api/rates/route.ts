/**
 * Charge rates (CM-01): see the current rates and the rate history (GET), and set a new rate (POST). Only the
 * committee may do either; the role check is the first line of each handler.
 *
 * @author Ayesha Siddiqa
 */
import { databaseChargeRateStore } from '@/lib/adapters/chargeRateAdapters';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppError, toErrorResponse } from '@/lib/errors';
import { readJsonObject } from '@/lib/parse';
import { databaseAuditWriter } from '@/services/auditService';
import {
  CHARGE_TYPES,
  INVALID_RATE_MESSAGE,
  getCurrentRates,
  getRateHistory,
  setRate,
} from '@/services/chargeRateService';

/**
 * Returns the rates in use now and the rate history.
 * @param request - The request; its cookies carry the session.
 * @returns 200 with `{ current, history }`, or an error (401 signed out, 403 not allowed).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole(request, 'viewRateHistory');
    const deps = { rates: databaseChargeRateStore(db) };
    const current = await getCurrentRates(deps);
    const history = await getRateHistory(deps);
    return Response.json({ current, history });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Sets a new rate from `{ chargeType, amountPoisha, meetingDate }`. The rate is in whole poisha; the page turns
 * taka into poisha before it calls this.
 * @param request - The request.
 * @returns 201 with the new Current rate, or an error (400 "Enter a valid rate and meeting date", 401, 403).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { actor } = await requireRole(request, 'setChargeRates');
    const body = await readJsonObject(request);

    const chargeType = CHARGE_TYPES.find((type) => type === body.chargeType);
    if (chargeType === undefined) {
      throw new AppError('BAD_REQUEST', INVALID_RATE_MESSAGE);
    }
    const amountPoisha = typeof body.amountPoisha === 'number' ? body.amountPoisha : null;
    const meetingDate = typeof body.meetingDate === 'string' ? body.meetingDate.trim() : null;

    const created = await setRate(
      { rates: databaseChargeRateStore(db), audit: databaseAuditWriter(db) },
      { chargeType, amountPoisha, meetingDate },
      actor.id,
    );
    return Response.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
