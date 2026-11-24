/**
 * Emergency contact numbers displayed on the emergency screens. The national emergency number 999 is fixed
 * and must always appear first (BR-12).
 *
 * @author Adika Rahman
 */
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/** Emergency contact numbers for the building. */
export const emergencyContacts = pgTable('emergency_contacts', {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull(),
  phone: text().notNull(),
  order: integer().notNull(),
}).enableRLS();

/** An emergency contact as read from the database. */
export type EmergencyContact = typeof emergencyContacts.$inferSelect;

/** The fields needed to create an emergency contact. */
export type NewEmergencyContact = typeof emergencyContacts.$inferInsert;
