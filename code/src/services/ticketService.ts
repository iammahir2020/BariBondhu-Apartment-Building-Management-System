/**
 * Business rules for a resident's fault tickets (RES-02): report a fault inside my flat or in a common area, and
 * "Me too" on a common-area fault someone already reported. A new ticket starts as Reported, my household follows
 * it, and its first status change is saved with it, so the history starts at the report.
 *
 * A common-area fault whose place and category match an open ticket isn't created again: the resident gets that
 * ticket back and can follow it with "Me too" (BR-13). Open means any status but the final ones, so a Fixed ticket
 * still counts until the manager closes it.
 *
 * Cancelling is only for a Reported ticket. If other households follow it, my household just stops following and
 * the ticket stays Reported for them; once a ticket is Assigned, only the manager can close it, and nobody can stop
 * following it (Decision 6 in `docs/test-cases.md`).
 *
 * The service checks everything before it touches anything: wording from `docs/test-cases.md` (Decisions), photo
 * rules from NFR-09. A photo is uploaded only after the checks pass, and removed again if the ticket can't be saved,
 * so a failed report leaves nothing behind (TC-R02-25).
 *
 * @author Mahir Al Kamal
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import {
  ticketCategoryEnum,
  type NewTicketFollower,
  type NewTicketStatusChange,
  type Profile,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
} from '@/models';
import type { AuditWriter } from '@/services/auditService';
import { checkTicketTransition, isFinalTicketStatus } from '@/services/ticketStateMachine';

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

/** Error text for "Me too". */
export const ME_TOO_ERRORS = {
  notFound: 'This ticket no longer exists.',
  notCommonArea: 'Only a common-area fault can be followed with Me too.',
  finished: 'This ticket is finished. Report the fault again if it is back.',
} as const;

/** Error text for cancelling a ticket. */
export const CANCEL_ERRORS = {
  notYours: "This isn't your household's ticket.",
  assigned: 'Once a ticket is assigned, only the manager can close it.',
  finished: 'This ticket is already finished.',
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

/** What happened to a report: a new ticket, or an open common-area ticket to follow instead (BR-13). */
export type ReportResult = { kind: 'created'; ticket: Ticket } | { kind: 'match'; ticket: Ticket };

/** What "Me too" leaves behind. */
export interface MeTooResult {
  ticket: Ticket;
  /** How many households follow the ticket now, the reporter's included. */
  followerCount: number;
  /** True if my household already followed it, so nothing changed. */
  alreadyFollowing: boolean;
}

/** What cancelling did: the ticket is Cancelled, or my household only stopped following it. */
export interface CancelResult {
  outcome: 'cancelled' | 'unfollowed';
  /** The ticket as it is now. */
  ticket: Ticket;
}

/** A ticket on my household's My tickets list, with what the list shows next to it. */
export interface HouseholdTicket {
  ticket: Ticket;
  /** The common-area place's name, or null for a fault inside the flat. */
  placeName: string | null;
  /** How many households follow it. */
  followerCount: number;
}

/** One row of My tickets. */
export interface MyTicket extends HouseholdTicket {
  /** True if my household reported it, false if it only follows it ("Me too"). */
  reportedByMe: boolean;
}

/** A common-area place a resident can pick. */
export interface PlaceOption {
  id: string;
  name: string;
}

/** The ticket reads and writes the resident's ticket services need. */
export interface TicketStore {
  /** The flat of an occupancy that hasn't ended, or null if it has ended or doesn't exist. */
  activeFlatOf(occupancyId: string): Promise<string | null>;
  /** Whether a common-area place exists and is switched on. */
  isActivePlace(placeId: string): Promise<boolean>;
  /** Saves the ticket, its first follower and its first status change together. */
  saveReported(rows: NewReportedTicket): Promise<void>;
  /** Every ticket at a place with a category, in any status, oldest first. */
  ticketsAt(placeId: string, category: TicketCategory): Promise<Ticket[]>;
  /** One ticket, or null if there is none with this id. */
  findById(ticketId: string): Promise<Ticket | null>;
  /** Whether a household follows a ticket. */
  isFollowing(ticketId: string, occupancyId: string): Promise<boolean>;
  /** Adds a follower. Saving the same household twice must not add a second row. */
  addFollower(row: NewTicketFollower): Promise<void>;
  /** How many households follow a ticket. */
  followerCount(ticketId: string): Promise<number>;
  /** Removes a household from a ticket's followers. */
  removeFollower(ticketId: string, occupancyId: string): Promise<void>;
  /**
   * Sets a ticket to Cancelled and saves the status change, in one transaction, but only if it is still Reported.
   * @returns False if the ticket was no longer Reported, so nothing changed.
   */
  cancelReported(statusChange: NewTicketStatusChange & { ticketId: string }): Promise<boolean>;
  /** The tickets a household reported or follows, in any status. */
  listForHousehold(occupancyId: string): Promise<HouseholdTicket[]>;
  /** The common-area places that are switched on, by name. */
  activePlaces(): Promise<PlaceOption[]>;
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
 * What the Report a fault form offers: the common-area places that are switched on (BR-13) and the categories.
 * Switched-off places are left out, so old tickets keep their place but nobody can pick it (TC-R02-14).
 * @param tickets - The ticket store.
 * @returns The places by name, and the categories in screen order.
 */
export async function reportFormOptions(
  tickets: TicketStore,
): Promise<{ places: PlaceOption[]; categories: readonly TicketCategory[] }> {
  return { places: await tickets.activePlaces(), categories: ticketCategoryEnum.enumValues };
}

/**
 * My household's tickets: the ones it reported and the ones it follows with "Me too", newest first, each with its
 * current status (TC-R02-22). Only the current household's: a new household in the same flat never sees an
 * earlier one's tickets, because they belong to the earlier occupancy (BR-09, TC-R02-23).
 * @param tickets - The ticket store.
 * @param resident - The signed-in resident.
 * @returns The tickets, newest first.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 */
export async function listMyTickets(tickets: TicketStore, resident: Profile): Promise<MyTicket[]> {
  const occupancyId = householdOf(resident);
  if ((await tickets.activeFlatOf(occupancyId)) === null) {
    throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  }
  const rows = await tickets.listForHousehold(occupancyId);
  return rows
    .map((row) => ({ ...row, reportedByMe: row.ticket.occupancyId === occupancyId }))
    .sort((a, b) => b.ticket.createdAt.getTime() - a.ticket.createdAt.getTime());
}

/** The resident's household, or 403 if the account has none. */
function householdOf(resident: Profile): string {
  if (resident.role !== 'resident' || resident.occupancyId === null) {
    throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  }
  return resident.occupancyId;
}

/**
 * The open ticket a new common-area report would duplicate: same place and category, in any status but Closed,
 * Cancelled, Duplicate and Won't fix (BR-13). The Report a fault page asks for it as soon as a place and category
 * are picked, so it can show the ticket with "Me too" before anything is typed.
 * @param tickets - The ticket store.
 * @param placeId - The common-area place.
 * @param category - The fault category.
 * @returns The oldest open matching ticket, or null if there is none.
 */
export async function findOpenMatch(
  tickets: TicketStore,
  placeId: string,
  category: TicketCategory,
): Promise<Ticket | null> {
  const atPlace = await tickets.ticketsAt(placeId, category);
  return atPlace.find((t) => !isFinalTicketStatus(t.status)) ?? null;
}

/**
 * Reports a fault for my household (RES-02). The ticket starts as Reported, with Normal priority, or Urgent from the
 * emergency screen or for a fire or gas smell. A flat ticket is for the household's own flat, taken from its
 * occupancy, never from the request. A common-area fault that matches an open ticket is not created; the match comes
 * back instead, for "Me too" (BR-13).
 * @param deps - Ticket store, photo store and audit writer.
 * @param reporter - The signed-in resident.
 * @param input - What the resident filled in.
 * @param now - The current time.
 * @returns The new ticket, or the open ticket that matches.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 * @throws AppError 400 "Describe the problem", "Give it a short title", "Use a JPG or PNG photo of 5 MB or less",
 *   "Choose a place from the list", or an emergency with another category.
 */
export async function reportFault(
  deps: TicketDeps,
  reporter: Profile,
  input: ReportFaultInput,
  now: Date = new Date(),
): Promise<ReportResult> {
  const occupancyId = householdOf(reporter);

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
    const match = await findOpenMatch(deps.tickets, placeId, input.category);
    if (match) return { kind: 'match', ticket: match };
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
  return { kind: 'created', ticket };
}

/**
 * "Me too": my household follows an open common-area ticket instead of reporting it again (RES-02, BR-13), so we're
 * told when its status changes. Tapping it again changes nothing and isn't an error.
 * @param deps - Ticket store and audit writer.
 * @param resident - The signed-in resident.
 * @param ticketId - The ticket to follow.
 * @param now - The current time.
 * @returns The ticket, how many households follow it now, and whether mine already did.
 * @throws AppError 403 if the account has no household, or the household has moved out.
 * @throws AppError 404 if there is no such ticket.
 * @throws AppError 409 if the ticket is inside a flat, or is Closed, Cancelled, Duplicate or Won't fix.
 */
export async function meToo(
  deps: Pick<TicketDeps, 'tickets' | 'audit' | 'newId'>,
  resident: Profile,
  ticketId: string,
  now: Date = new Date(),
): Promise<MeTooResult> {
  const occupancyId = householdOf(resident);
  if ((await deps.tickets.activeFlatOf(occupancyId)) === null) {
    throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  }
  const ticket = await deps.tickets.findById(ticketId);
  if (!ticket) throw new AppError('NOT_FOUND', ME_TOO_ERRORS.notFound);
  if (ticket.placeId === null) throw new AppError('CONFLICT', ME_TOO_ERRORS.notCommonArea);
  if (isFinalTicketStatus(ticket.status)) throw new AppError('CONFLICT', ME_TOO_ERRORS.finished);

  const alreadyFollowing = await deps.tickets.isFollowing(ticketId, occupancyId);
  if (!alreadyFollowing) {
    const newId = deps.newId ?? randomUUID;
    await deps.tickets.addFollower({ id: newId(), ticketId, occupancyId, createdAt: now });
    await deps.audit({
      actorId: resident.id,
      action: 'ticket.follow',
      entityType: 'tickets',
      entityId: ticketId,
      oldValues: null,
      newValues: { occupancyId },
    });
  }
  return {
    ticket,
    followerCount: await deps.tickets.followerCount(ticketId),
    alreadyFollowing,
  };
}

/**
 * Cancels my household's ticket, or stops following it (RES-02). Only a Reported ticket can be cancelled, and only
 * by the household that reported it when no other household follows it; then it becomes Cancelled, through the
 * ticket state machine. If others follow it, or my household only tapped "Me too", my household stops following and
 * the ticket stays Reported. From Assigned on, only the manager can close it and nobody can stop following it.
 * @param deps - Ticket store and audit writer.
 * @param resident - The signed-in resident.
 * @param ticketId - The ticket to cancel.
 * @param now - The current time.
 * @returns Whether the ticket was cancelled or my household stopped following it, and the ticket as it is now.
 * @throws AppError 403 if the account has no household, the household has moved out, or the ticket is another
 *   household's that mine doesn't follow.
 * @throws AppError 404 if there is no such ticket.
 * @throws AppError 409 if the ticket is no longer Reported.
 */
export async function cancelTicket(
  deps: Pick<TicketDeps, 'tickets' | 'audit' | 'newId'>,
  resident: Profile,
  ticketId: string,
  now: Date = new Date(),
): Promise<CancelResult> {
  const occupancyId = householdOf(resident);
  if ((await deps.tickets.activeFlatOf(occupancyId)) === null) {
    throw new AppError('FORBIDDEN', REPORT_ERRORS.household);
  }
  const ticket = await deps.tickets.findById(ticketId);
  if (!ticket) throw new AppError('NOT_FOUND', ME_TOO_ERRORS.notFound);

  const reportedByMe = ticket.occupancyId === occupancyId;
  const following = await deps.tickets.isFollowing(ticketId, occupancyId);
  if (!reportedByMe && !following) throw new AppError('FORBIDDEN', CANCEL_ERRORS.notYours);
  if (ticket.status !== 'Reported') {
    const message = isFinalTicketStatus(ticket.status)
      ? CANCEL_ERRORS.finished
      : CANCEL_ERRORS.assigned;
    throw new AppError('CONFLICT', message, { status: ticket.status });
  }

  const others = (await deps.tickets.followerCount(ticketId)) - (following ? 1 : 0);
  if (!reportedByMe || others > 0) {
    if (following) await deps.tickets.removeFollower(ticketId, occupancyId);
    await deps.audit({
      actorId: resident.id,
      action: 'ticket.unfollow',
      entityType: 'tickets',
      entityId: ticketId,
      oldValues: { occupancyId },
      newValues: null,
    });
    return { outcome: 'unfollowed', ticket };
  }

  checkTicketTransition('Reported', 'Cancelled', resident.role);
  const newId = deps.newId ?? randomUUID;
  const saved = await deps.tickets.cancelReported({
    id: newId(),
    ticketId,
    fromStatus: 'Reported',
    toStatus: 'Cancelled',
    changedById: resident.id,
    reason: null,
    createdAt: now,
  });
  if (!saved) throw new AppError('CONFLICT', CANCEL_ERRORS.assigned);

  await deps.audit({
    actorId: resident.id,
    action: 'ticket.cancel',
    entityType: 'tickets',
    entityId: ticketId,
    oldValues: { status: 'Reported' },
    newValues: { status: 'Cancelled' },
  });
  return { outcome: 'cancelled', ticket: { ...ticket, status: 'Cancelled', updatedAt: now } };
}
