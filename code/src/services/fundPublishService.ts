/**
 * Publishing the monthly fund summary (BM-12): the manager publishes a month once it has ended. The figures are
 * worked out from the saved records (BR-10) and saved as Published. The first month can be published only after
 * its opening balance is Approved. Every publish is written to the audit log (NFR-27).
 *
 * @author Ayesha Siddiqa
 */
import { AppError } from '@/lib/errors';
import type { FundSummary, NewFundSummary } from '@/models';
import type { AuditWriter } from '@/services/auditService';
import {
  workOutMonth,
  type FundFigureDeps,
  type MonthFigures,
} from '@/services/fundSummaryService';

/** Shown when the manager publishes a month that has not ended (BM-12). */
export const MONTH_NOT_ENDED_MESSAGE = 'You can publish once the month has ended';

/** The summary reads and writes this service needs. */
export interface FundSummaryStore {
  /** The saved summary of this month (YYYY-MM-01), or undefined. */
  findByMonth(month: string): Promise<FundSummary | undefined>;
  /** Saves a new summary and returns it as stored. */
  insert(summary: NewFundSummary): Promise<FundSummary>;
  /** Changes some fields of a summary and returns it as stored. */
  update(id: string, changes: Partial<NewFundSummary>): Promise<FundSummary>;
  /** Every summary, newest month first. */
  list(): Promise<FundSummary[]>;
}

/** What the publish functions work with. */
export interface FundPublishDeps extends FundFigureDeps {
  summaries: FundSummaryStore;
  audit: AuditWriter;
}

/**
 * Today's date in Asia/Dhaka (BR-01), as YYYY-MM-DD.
 * @param now - The current time.
 * @returns The Dhaka date.
 */
function todayInDhaka(now: Date): string {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The first day of the month after the given one.
 * @param month - A date like 2026-10-01.
 * @returns The next first-of-month date.
 */
function nextMonth(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The fields of a summary that go in the audit log.
 * @param summary - The summary.
 * @returns A plain object of its main fields.
 */
function snapshot(summary: FundSummary): Record<string, unknown> {
  return {
    month: summary.month,
    openingBalancePoisha: summary.openingBalancePoisha,
    totalCollectedPoisha: summary.totalCollectedPoisha,
    spentRepairPoisha: summary.spentRepairPoisha,
    spentSalaryPoisha: summary.spentSalaryPoisha,
    spentUtilityPoisha: summary.spentUtilityPoisha,
    spentOtherPoisha: summary.spentOtherPoisha,
    closingBalancePoisha: summary.closingBalancePoisha,
    totalOutstandingPoisha: summary.totalOutstandingPoisha,
    status: summary.status,
  };
}

/**
 * The figures as the fields of a summary row.
 * @param figures - The worked-out figures.
 * @returns The figure fields of a summary.
 */
function figureFields(figures: MonthFigures): Omit<NewFundSummary, 'status'> {
  return {
    month: figures.month,
    openingBalancePoisha: figures.openingBalancePoisha,
    totalCollectedPoisha: figures.totalCollectedPoisha,
    spentRepairPoisha: figures.spentRepairPoisha,
    spentSalaryPoisha: figures.spentSalaryPoisha,
    spentUtilityPoisha: figures.spentUtilityPoisha,
    spentOtherPoisha: figures.spentOtherPoisha,
    closingBalancePoisha: figures.closingBalancePoisha,
    totalOutstandingPoisha: figures.totalOutstandingPoisha,
  };
}

/**
 * Publishes the summary of a month that has ended. The month ends on its last day, so publishing is allowed from
 * the first day of the next month (Dhaka date, BR-01).
 * @param deps - Figure stores, summary store and audit writer.
 * @param month - First day of the month, like 2026-10-01.
 * @param actorId - The manager publishing it.
 * @param now - The current time.
 * @returns The Published summary.
 * @throws AppError 400 "Check the month" if the month is not the first day of a real month.
 * @throws AppError 400 "You can publish once the month has ended" if the month has not ended.
 * @throws AppError 409 if the month is already published, or the first month has no Approved opening balance.
 */
export async function publishFundSummary(
  deps: FundPublishDeps,
  month: string,
  actorId: string,
  now: Date = new Date(),
): Promise<FundSummary> {
  const figures = await workOutMonth(deps, month);
  if (todayInDhaka(now) < nextMonth(month)) {
    throw new AppError('BAD_REQUEST', MONTH_NOT_ENDED_MESSAGE);
  }

  const existing = await deps.summaries.findByMonth(month);
  if (existing !== undefined && existing.status !== 'Draft') {
    throw new AppError('CONFLICT', `This month's summary is already ${existing.status}.`);
  }

  const published = {
    ...figureFields(figures),
    status: 'Published' as const,
    publishedBy: actorId,
    publishedAt: now,
  };
  const saved =
    existing === undefined
      ? await deps.summaries.insert(published)
      : await deps.summaries.update(existing.id, { ...published, updatedAt: now });

  await deps.audit({
    actorId,
    action: 'fundSummary.publish',
    entityType: 'fund_summaries',
    entityId: saved.id,
    oldValues: existing === undefined ? null : snapshot(existing),
    newValues: snapshot(saved),
  });
  return saved;
}

/**
 * The summaries the manager, committee and residents can read: only Published or Revised ones, newest month first.
 * A Draft is never shown (RES-05 c3).
 * @param deps - Summary store.
 * @returns The visible summaries.
 */
export async function listPublishedSummaries(
  deps: Pick<FundPublishDeps, 'summaries'>,
): Promise<FundSummary[]> {
  const all = await deps.summaries.list();
  return all.filter((row) => row.status !== 'Draft').sort((a, b) => b.month.localeCompare(a.month));
}
