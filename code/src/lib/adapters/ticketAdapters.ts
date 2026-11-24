/**
 * Database and Supabase Storage adapters for `ticketService.ts`: tickets, followers and status changes in the
 * database, and ticket photos in a private Storage bucket. Connection code only; the rules are in the service.
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db';
import { AppError } from '@/lib/errors';
import {
  commonAreaPlaces,
  occupancies,
  profiles,
  ticketFollowers,
  ticketStatusChanges,
  tickets,
} from '@/models';
import { databaseAuditWriter } from '@/services/auditService';
import { noopNotifier } from '@/services/notifier';
import type { TicketNoticeDeps, TicketRecipients } from '@/services/ticketNotifications';
import {
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  type PhotoStore,
  type TicketDeps,
  type TicketStore,
} from '@/services/ticketService';

/**
 * Everything the resident's ticket services need, wired to the database and Storage.
 * @param db - Database to use.
 * @param admin - The service-role Supabase client, for photos.
 * @returns The ticket store, photo store, audit writer and notices.
 */
export function ticketDeps(db: Database, admin: SupabaseClient): TicketDeps {
  return {
    tickets: databaseTicketStore(db),
    photos: supabasePhotoStore(admin),
    audit: databaseAuditWriter(db),
    notices: ticketNotices(db),
  };
}

/**
 * Who to tell about a ticket, and how. Every ticket service (features 12 to 15) takes its notices from here.
 * Notifications go nowhere until Adika's notifier (BB-2306) is merged; then only `notify` changes.
 * @param db - Database to use.
 * @returns The recipients and the notifier.
 */
export function ticketNotices(db: Database): TicketNoticeDeps {
  return { recipients: databaseTicketRecipients(db), notify: noopNotifier };
}

/**
 * {@link TicketRecipients} backed by the database. A household shares one resident profile (BR-09), so a
 * follower household is told through its active resident profile.
 * @param db - Database to use.
 * @returns The recipients.
 */
export function databaseTicketRecipients(db: Database): TicketRecipients {
  return {
    async activeManagerIds() {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.role, 'manager'), eq(profiles.active, true)));
      return rows.map((row) => row.id);
    },

    async followerAccountIds(ticketId) {
      const rows = await db
        .select({ id: profiles.id })
        .from(ticketFollowers)
        .innerJoin(profiles, eq(profiles.occupancyId, ticketFollowers.occupancyId))
        .where(
          and(
            eq(ticketFollowers.ticketId, ticketId),
            eq(profiles.role, 'resident'),
            eq(profiles.active, true),
          ),
        );
      return rows.map((row) => row.id);
    },
  };
}

/** The private Storage bucket for ticket photos. Only the server reads it, with the service-role key. */
export const TICKET_PHOTO_BUCKET = 'ticket-photos';

/** Shown when Storage refuses or fails an upload (TC-R02-25). */
const UPLOAD_FAILED_MESSAGE = 'Could not upload the photo. Please try again.';

/**
 * A {@link TicketStore} backed by the database.
 * @param db - Database to use.
 * @returns The store.
 */
export function databaseTicketStore(db: Database): TicketStore {
  /** How many households follow each ticket, as a column. */
  const followerCount = sql<number>`(select count(*)::int from ${ticketFollowers} where ${ticketFollowers.ticketId} = ${tickets.id})`;

  return {
    async activeFlatOf(occupancyId) {
      const [row] = await db
        .select({ flatId: occupancies.flatId })
        .from(occupancies)
        .where(and(eq(occupancies.id, occupancyId), isNull(occupancies.endDate)));
      return row?.flatId ?? null;
    },

    async isActivePlace(placeId) {
      const [row] = await db
        .select({ id: commonAreaPlaces.id })
        .from(commonAreaPlaces)
        .where(and(eq(commonAreaPlaces.id, placeId), eq(commonAreaPlaces.active, true)));
      return row !== undefined;
    },

    async saveReported({ ticket, follower, statusChange }) {
      await db.transaction(async (tx) => {
        await tx.insert(tickets).values(ticket);
        await tx.insert(ticketFollowers).values(follower);
        await tx.insert(ticketStatusChanges).values(statusChange);
      });
    },

    async ticketsAt(placeId, category) {
      return db
        .select()
        .from(tickets)
        .where(and(eq(tickets.placeId, placeId), eq(tickets.category, category)))
        .orderBy(asc(tickets.createdAt));
    },

    async findById(ticketId) {
      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
      return row ?? null;
    },

    async isFollowing(ticketId, occupancyId) {
      const [row] = await db
        .select({ id: ticketFollowers.id })
        .from(ticketFollowers)
        .where(
          and(eq(ticketFollowers.ticketId, ticketId), eq(ticketFollowers.occupancyId, occupancyId)),
        );
      return row !== undefined;
    },

    async addFollower(row) {
      await db.insert(ticketFollowers).values(row).onConflictDoNothing();
    },

    async followerCount(ticketId) {
      const [row] = await db
        .select({ n: count() })
        .from(ticketFollowers)
        .where(eq(ticketFollowers.ticketId, ticketId));
      return row?.n ?? 0;
    },

    async removeFollower(ticketId, occupancyId) {
      await db
        .delete(ticketFollowers)
        .where(
          and(eq(ticketFollowers.ticketId, ticketId), eq(ticketFollowers.occupancyId, occupancyId)),
        );
    },

    async cancelReported(change) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(tickets)
          .set({ status: 'Cancelled', updatedAt: change.createdAt ?? new Date() })
          .where(and(eq(tickets.id, change.ticketId), eq(tickets.status, 'Reported')))
          .returning({ id: tickets.id });
        if (updated.length === 0) return false;
        await tx.insert(ticketStatusChanges).values(change);
        return true;
      });
    },

    async listForHousehold(occupancyId) {
      const followed = db
        .select({ id: ticketFollowers.ticketId })
        .from(ticketFollowers)
        .where(eq(ticketFollowers.occupancyId, occupancyId));
      const rows = await db
        .select({ ticket: tickets, placeName: commonAreaPlaces.name, followerCount })
        .from(tickets)
        .leftJoin(commonAreaPlaces, eq(commonAreaPlaces.id, tickets.placeId))
        .where(or(eq(tickets.occupancyId, occupancyId), inArray(tickets.id, followed)));
      return rows;
    },

    async activePlaces() {
      return db
        .select({ id: commonAreaPlaces.id, name: commonAreaPlaces.name })
        .from(commonAreaPlaces)
        .where(eq(commonAreaPlaces.active, true))
        .orderBy(asc(commonAreaPlaces.name));
    },
  };
}

/**
 * A {@link PhotoStore} backed by Supabase Storage. Creates the private bucket the first time it is missing, so a
 * fresh project needs no manual setup.
 * @param admin - The service-role client (server only).
 * @returns The store.
 */
export function supabasePhotoStore(admin: SupabaseClient): PhotoStore {
  const bucket = () => admin.storage.from(TICKET_PHOTO_BUCKET);

  async function createBucket(): Promise<void> {
    const { error } = await admin.storage.createBucket(TICKET_PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: [...PHOTO_TYPES],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }

  return {
    async upload(photo, ticketId) {
      const type = photo.contentType.toLowerCase();
      const path = `${ticketId}.${type === 'image/png' ? 'png' : 'jpg'}`;
      const send = () => bucket().upload(path, photo.bytes, { contentType: type, upsert: false });

      let { error } = await send();
      if (error && /bucket not found/i.test(error.message)) {
        await createBucket();
        ({ error } = await send());
      }
      if (error) {
        console.error(error);
        throw new AppError('INTERNAL', UPLOAD_FAILED_MESSAGE);
      }
      return path;
    },

    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) console.error(error);
    },
  };
}
