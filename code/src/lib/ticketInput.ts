/**
 * Reads the ticket routes' input (RES-02): the Report a fault form, which comes as `multipart/form-data` because it
 * can carry a photo, the place and category for the "Me too" match, and ticket ids from the URL. Everything stays
 * `unknown` until checked here; the rules themselves are in `ticketService.ts`.
 *
 * Ids are checked to be UUIDs before they reach the database, so a mistyped id is a 400 or 404, not a database
 * error.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { ticketCategoryEnum, type TicketCategory } from '@/models';
import { ME_TOO_ERRORS, REPORT_ERRORS, type ReportFaultInput } from '@/services/ticketService';

/** Shown when the category isn't one of the list. The form only offers the list, so this means a bad request. */
export const CATEGORY_MESSAGE = 'Choose a category from the list';

/** Shown when "Inside my flat" or "Common area" wasn't chosen. */
export const WHERE_MESSAGE = 'Choose inside my flat or a common area';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is a UUID, the form of every id in the database.
 * @param value - Anything.
 * @returns `true` for a UUID string.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * A ticket id from the URL.
 * @param id - The `[id]` segment.
 * @returns The id.
 * @throws AppError 404 if it isn't a UUID, so it can't name any ticket.
 */
export function requireTicketId(id: string): string {
  if (!isUuid(id)) throw new AppError('NOT_FOUND', ME_TOO_ERRORS.notFound);
  return id;
}

/**
 * A category from the form or the query string.
 * @param value - The raw value.
 * @returns The category.
 * @throws AppError 400 if it isn't one of the categories.
 */
export function parseCategory(value: unknown): TicketCategory {
  const category = ticketCategoryEnum.enumValues.find((c) => c === value);
  if (!category) throw new AppError('BAD_REQUEST', CATEGORY_MESSAGE);
  return category;
}

/**
 * A common-area place id from the form or the query string.
 * @param value - The raw value.
 * @returns The id.
 * @throws AppError 400 "Choose a place from the list" if it isn't a UUID.
 */
export function parsePlaceId(value: unknown): string {
  if (!isUuid(value)) throw new AppError('BAD_REQUEST', REPORT_ERRORS.place);
  return value;
}

/** A text field of the form, or '' when it is missing or a file. */
function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

/**
 * Reads the Report a fault form. Title and description are passed on as typed, so the service can answer an empty
 * one with its own wording ("Describe the problem", "Give it a short title").
 * @param form - The request's form data.
 * @returns The report, ready for `reportFault`.
 * @throws AppError 400 if where, the category or the place isn't one of the choices offered.
 */
export async function parseReportForm(form: FormData): Promise<ReportFaultInput> {
  const where = text(form, 'where');
  if (where !== 'flat' && where !== 'common') throw new AppError('BAD_REQUEST', WHERE_MESSAGE);
  const category = parseCategory(text(form, 'category'));
  const placeText = text(form, 'placeId');

  let placeId: string | null = null;
  if (where === 'common') placeId = parsePlaceId(placeText);
  else if (placeText !== '') throw new AppError('BAD_REQUEST', REPORT_ERRORS.place);

  const photoField = form.get('photo');
  const photo =
    photoField instanceof File && photoField.size > 0
      ? { contentType: photoField.type, bytes: new Uint8Array(await photoField.arrayBuffer()) }
      : null;

  return {
    where,
    placeId,
    category,
    title: text(form, 'title'),
    description: text(form, 'description'),
    homeTimes: text(form, 'homeTimes') || null,
    photo,
    emergency: text(form, 'emergency') === 'true',
  };
}
