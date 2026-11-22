/**
 * Business rules for a resident's fault tickets (RES-02): report a fault inside my flat or in a common area. The
 * ticket starts as Reported, my household follows it, and its first status change is saved with it, so the history
 * starts at the report.
 *
 * The service checks everything before it touches anything: wording from `docs/test-cases.md` (Decisions), photo
 * rules from NFR-09. A photo is uploaded only after the checks pass, and removed again if the ticket can't be saved,
 * so a failed report leaves nothing behind (TC-R02-25).
 *
 * @author Mahir Al Kamal
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type {
  NewTicketFollower,
  NewTicketStatusChange,
  Profile,
  Ticket,
  TicketCategory,
  TicketPriority,
} from '@/models';
import type { AuditWriter } from '@/services/auditService';

/** Largest photo accepted: 5 MB (NFR-09). The phone compresses to about 1 MB first. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Photo types accepted (NFR-09). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;

/** Categories a resident can log from the emergency screen (RES-02): fire or gas smell, someone stuck in a lift. */
export const EMERGENCY_CATEGORIES: readonly TicketCategory[] = ['Fire or gas smell', 'Lift'];

/** Error text for each rule a report can break. */
export const REPORT_ERRORS = {
  description: 'Describe the problem',
  title: 'Give it a short title',
  photo: 'Use a JPG or PNG photo of 5 MB or less',
  place: 'Choose a place from the list',
  household: 'Only a household account can report a fault.',
  emergency: 'Only a fire, gas smell or lift emergency can be logged from the emergency screen.',
} as const;

/** A photo as the resident sent it, before it is stored. */
export interface TicketPhoto {
  /** The type the browser gave, such as `image/jpeg`. */
  contentType: string;
  bytes: Uint8Array;
}

/** What a resident fills in on the Report a fault screen. */
export interface ReportFaultInput {
  /** Inside my flat, or in a common area. */
  where: 'flat' | 'common';
  /** The common-area place; only for `common`. */
  placeId?: string | null;
  category: TicketCategory;
  title: string;
  description: string;
  /** When someone is home ("Weekdays after 5 pm"); optional. */
  homeTimes?: string | null;
  photo?: TicketPhoto | null;
  /** True when sent with "Log it for repair" from the emergency screen; makes the ticket Urgent. */
  emergency?: boolean;
}

/** The new ticket and the rows saved with it, in one transaction. */
export interface NewReportedTicket {
  ticket: Ticket;
  follower: NewTicketFollower;
  statusChange: NewTicketStatusChange;
}

/** The ticket reads and writes reporting needs. */
export interface TicketStore {
  /** The flat of an occupancy that hasn't ended, or null if it has ended or doesn't exist. */
  activeFlatOf(occupancyId: string): Promise<string | null>;
  /** Whether a common-area place exists and is switched on. */
  isActivePlace(placeId: string): Promise<boolean>;
  /** Saves the ticket, its first follower and its first status change together. */
  saveReported(rows: NewReportedTicket): Promise<void>;
}

/** Where ticket photos are kept (Supabase Storage in the app). */
export interface PhotoStore {
  /** Stores a checked photo and returns its path. */
  upload(photo: TicketPhoto, ticketId: string): Promise<string>;
  /** Removes a photo, to undo an upload when the ticket couldn't be saved. */
  remove(path: string): Promise<void>;
}

/** What {@link reportFault} works with. */
export interface TicketDeps {
  tickets: TicketStore;
  photos: PhotoStore;
  audit: AuditWriter;
  /** Makes ids; tests pass a fixed one. */
  newId?: () => string;
}

/** The first bytes of a JPG and a PNG file, so a renamed file of another type is refused. */
const SIGNATURES: Record<(typeof PHOTO_TYPES)[number], readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/**
 * Whether a photo is a JPG or PNG of at most 5 MB (NFR-09). Both the type the browser gave and the file's first
 * bytes must say JPG or PNG.
 * @param photo - The photo as sent.
 * @returns `true` if it may be stored.
 */
export function isAcceptedPhoto(photo: TicketPhoto): boolean {
  if (photo.bytes.byteLength === 0 || photo.bytes.byteLength > MAX_PHOTO_BYTES) return false;
  const type = PHOTO_TYPES.find((t) => t === photo.contentType.toLowerCase());
  if (!type) return false;
  return SIGNATURES[type].every((byte, i) => photo.bytes[i] === byte);
}

/**
 * Reports a fault for my household (RES-02). The ticket starts as Reported, with Normal priority, or Urgent from the
 * emergency screen or for a fire or gas smell. A flat ticket is for the household's own flat, taken from its
 * occupancy, never from the request.
 * @param deps - Ticket store, photo store and audit writer.
 * @param reporter - The signed-in resident.
 * @param input - What the resident filled in.
 * @param now - The current time.
 * @returns The new ticket.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 * @throws AppError 400 "Describe the problem", "Give it a short title", "Use a JPG or PNG photo of 5 MB or less",
 *   "Choose a place from the list", or an emergency with another category.
 */
export async function reportFault(
  deps: TicketDeps,
  reporter: Profile,
  input: ReportFaultInput,
  now: Date = new Date(),
): Promise<Ticket> {
  const occupancyId = reporter.occupancyId;
  if (reporter.role !== 'resident' || occupancyId === null) {
    throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  }

  const description = input.description.trim();
  if (description === '') throw new AppError('BAD_REQUEST', REPORT_ERRORS.description);
  const title = input.title.trim();
  if (title === '') throw new AppError('BAD_REQUEST', REPORT_ERRORS.title);
  if (input.photo && !isAcceptedPhoto(input.photo)) {
    throw new AppError('BAD_REQUEST', REPORT_ERRORS.photo);
  }
  if (input.emergency && !EMERGENCY_CATEGORIES.includes(input.category)) {
    throw new AppError('BAD_REQUEST', REPORT_ERRORS.emergency);
  }

  let flatId: string | null = null;
  let placeId: string | null = null;
  if (input.where === 'flat') {
    if (input.placeId) throw new AppError('BAD_REQUEST', REPORT_ERRORS.place);
    flatId = await deps.tickets.activeFlatOf(occupancyId);
    if (flatId === null) throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  } else {
    if (!input.placeId || !(await deps.tickets.isActivePlace(input.placeId))) {
      throw new AppError('BAD_REQUEST', REPORT_ERRORS.place);
    }
    placeId = input.placeId;
  }

  const priority: TicketPriority =
    input.emergency || input.category === 'Fire or gas smell' ? 'Urgent' : 'Normal';
  const newId = deps.newId ?? randomUUID;
  const ticketId = newId();
  const photoPath = input.photo ? await deps.photos.upload(input.photo, ticketId) : null;

  const ticket: Ticket = {
    id: ticketId,
    reportedById: reporter.id,
    occupancyId,
    category: input.category,
    flatId,
    placeId,
    title,
    description,
    photoPath,
    homeTimes: input.homeTimes?.trim() || null,
    status: 'Reported',
    priority,
    assigneeId: null,
    dueDate: null,
    instructions: null,
    foundByStaff: false,
    linkedTicketId: null,
    duplicateOfId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await deps.tickets.saveReported({
      ticket,
      follower: { id: newId(), ticketId, occupancyId, createdAt: now },
      statusChange: {
        id: newId(),
        ticketId,
        fromStatus: null,
        toStatus: 'Reported',
        changedById: reporter.id,
        reason: null,
        createdAt: now,
      },
    });
  } catch (error) {
    if (photoPath) await deps.photos.remove(photoPath);
    throw error;
  }

  await deps.audit({
    actorId: reporter.id,
    action: 'ticket.report',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: null,
    newValues: { category: ticket.category, flatId, placeId, priority, status: ticket.status },
  });
  return ticket;
}
