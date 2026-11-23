/**
 * Charge rates: the service, generator and water amounts the committee sets at a meeting (CM-01). A new rate
 * replaces the current one; the old one stays as Replaced so the rate history can be shown.
 *
 * @author Ayesha Siddiqa
 */
import { date, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './Profile';

/** The three monthly charges a rate can be set for. */
export const chargeTypeEnum = pgEnum('charge_type', ['service', 'generator', 'water']);

/** Whether a rate is the one in use now or an older one that was replaced. */
export const chargeRateStatusEnum = pgEnum('charge_rate_status', ['Current', 'Replaced']);

/** Charge rates: one row per rate set. Only one Current row per charge type. */
export const chargeRates = pgTable('charge_rates', {
  id: uuid().primaryKey().defaultRandom(),
  chargeType: chargeTypeEnum().notNull(),
  /** Amount in whole poisha, never a float. */
  amountPoisha: integer().notNull(),
  /** Date of the committee meeting that decided this rate. */
  meetingDate: date({ mode: 'string' }).notNull(),
  /** The committee member who entered the rate. */
  setBy: uuid()
    .notNull()
    .references(() => profiles.id),
  status: chargeRateStatusEnum().notNull().default('Current'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** A charge rate as read from the database. */
export type ChargeRate = typeof chargeRates.$inferSelect;

/** The fields needed to create a charge rate. */
export type NewChargeRate = typeof chargeRates.$inferInsert;
