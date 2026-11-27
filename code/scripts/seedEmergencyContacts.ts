/**
 * Demo data for emergency contacts (BB-2003): the guard-desk and manager phone numbers.
 * `seed.ts` calls {@link seedEmergencyContacts} after the demo accounts exist.
 *
 * Contacts are found by label and updated on reruns, so the seed does not create duplicates.
 * The fixed national emergency number 999 is displayed separately and is not stored here.
 *
 * @author Adika Rahman
 */
import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../src/models';

const { emergencyContacts, profiles } = schema;

/** A building emergency contact linked to a demo account. */
interface SampleContact {
  label: string;
  username: 'bb-guard' | 'bb-manager';
  order: number;
}

/** The two building contacts shown after the fixed national emergency number. */
const SAMPLE_CONTACTS: readonly SampleContact[] = [
  {
    label: 'Guard desk',
    username: 'bb-guard',
    order: 1,
  },
  {
    label: 'Manager',
    username: 'bb-manager',
    order: 2,
  },
];

/**
 * Seeds the guard-desk and manager emergency contacts.
 *
 * @param db - The seed script's database client.
 * @returns How many emergency contacts are configured.
 * @throws Error if a demo guard or manager account is missing or has no phone number.
 */
export async function seedEmergencyContacts(
  db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
  const demoProfiles = await db
    .select({ username: profiles.username, phone: profiles.phone })
    .from(profiles)
    .where(inArray(profiles.username, ['bb-guard', 'bb-manager']));

  for (const contact of SAMPLE_CONTACTS) {
    const profile = demoProfiles.find((item) => item.username === contact.username);

    if (!profile?.phone) {
      throw new Error(`Demo account ${contact.username} or its phone number is missing.`);
    }

    const values = {
      label: contact.label,
      phone: profile.phone,
      order: contact.order,
    };

    const [existing] = await db
      .select({ id: emergencyContacts.id })
      .from(emergencyContacts)
      .where(eq(emergencyContacts.label, contact.label));

    if (existing) {
      await db.update(emergencyContacts).set(values).where(eq(emergencyContacts.id, existing.id));
    } else {
      await db.insert(emergencyContacts).values(values);
    }
  }

  return SAMPLE_CONTACTS.length;
}
